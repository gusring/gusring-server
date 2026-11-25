import { createHash } from 'node:crypto';
import { readPngSize } from '../../utils/png.js';
import { AppError } from '../../utils/response.js';
import { auditRepository } from '../audit/audit.repository.js';
import { validateDefinition, type Problem } from './form-validate.js';
import { formRepository as repo, isUniqueViolation } from './form.repository.js';
import {
  formDefinition, type CreateFormBody, type FormDefinition, type PublishBody, type SaveDraftBody,
} from './form.schema.js';

type Db = Parameters<Parameters<typeof repo.transaction>[0]>[0];

/** 이용자 화면이 쪽 이미지를 받는 주소 (같은 서버 기준 절대 경로) */
export const imageUrl = (id: string) => `/api/v1/form-images/${id}`;

const emptyL = () => ({ ko: '', en: '', zh: '', ja: '', vi: '' });

/** 정의 없이 만들 때의 빈 초안 */
export const emptyDefinition = (): FormDefinition => ({
  title: emptyL(), desc: emptyL(), category: 'CERT', pages: [], sections: [], fields: [],
});

/** DB에 저장된 정의를 다시 모양 검사 (저장할 때 검사했지만 스키마가 바뀌었을 수 있다) */
function parseStored(value: unknown): { def: FormDefinition } | { problems: Problem[] } {
  const r = formDefinition.safeParse(value);
  if (r.success) return { def: r.data };
  return { problems: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

async function assertFree(db: Db, key: string, formNo: number, exceptId?: string) {
  const taken = await repo.findTaken(db, key, formNo, exceptId);
  if (taken.some((t) => t.key === key)) throw new AppError('FORM_KEY_TAKEN');
  if (taken.some((t) => t.formNo === formNo)) throw new AppError('FORM_NO_TAKEN');
}

/** 동시에 같은 key·번호로 만들어 unique에 걸린 경우 → 어느 쪽인지 다시 보고 알려 준다 */
async function rethrowTaken(e: unknown, key: string, formNo: number, exceptId?: string): Promise<never> {
  if (isUniqueViolation(e)) {
    await repo.transaction((tx) => assertFree(tx, key, formNo, exceptId));
    throw new AppError('FORM_KEY_TAKEN');
  }
  throw e;
}

async function lockOrNotFound(tx: Db, id: string) {
  if (!(await repo.lock(tx, id))) throw new AppError('FORM_NOT_FOUND');
  const form = await repo.findById(id, tx);
  if (!form) throw new AppError('FORM_NOT_FOUND');
  return form;
}

function checkBase(form: { draftUpdatedAt: Date; draftUpdatedBy: string }, base: string | undefined) {
  if (base === undefined || new Date(base).getTime() === form.draftUpdatedAt.getTime()) return;
  throw new AppError(
    'FORM_CONFLICT',
    `${form.draftUpdatedBy}님이 ${form.draftUpdatedAt.toISOString()}에 먼저 저장했습니다. 다시 불러와 주세요.`,
  );
}

async function adminItem(db: Db, id: string) {
  const form = await repo.findById(id, db);
  if (!form) throw new AppError('FORM_NOT_FOUND');
  const { draft, ...meta } = form;
  return { ...meta, definition: draft as unknown as FormDefinition, hasUnpublishedChanges: await repo.draftDiffers(db, id) };
}

export const formService = {
  // ── 공개 ──
  async listPublished() {
    const rows = await repo.findPublishedList();
    return rows.map((r) => ({ key: r.key, formNo: r.form_no, category: r.category, title: r.title, desc: r.desc, version: r.version }));
  },

  async getPublished(key: string) {
    const row = await repo.findPublishedByKey(key);
    if (!row) throw new AppError('FORM_NOT_FOUND');
    const def = row.definition as FormDefinition;
    const pages = def.pages.map(({ imageId, ...rest }) => ({ image: imageUrl(imageId), ...rest }));
    return { key: row.key, formNo: row.form_no, version: row.version, definition: { ...def, pages } };
  },

  async getImage(id: string) {
    const img = await repo.findImage(id);
    if (!img) throw new AppError('FORM_IMAGE_NOT_FOUND');
    return Buffer.from(img.bytes);
  },

  // ── 관리자 ──
  async listAdmin() {
    const rows = await repo.findAdminList();
    return rows.map((r) => ({
      id: r.id, key: r.key, formNo: r.form_no, title: r.title, category: r.category,
      draftUpdatedAt: r.draft_updated_at, draftUpdatedBy: r.draft_updated_by,
      publishedVersion: r.published_version, hasUnpublishedChanges: r.has_unpublished_changes,
    }));
  },

  get: (id: string) => repo.transaction((tx) => adminItem(tx, id)),

  async create(body: CreateFormBody, actor: string) {
    try {
      const item = await repo.transaction(async (tx) => {
        await assertFree(tx, body.key, body.formNo);
        let draft = body.definition ?? emptyDefinition();
        if (body.copyFrom) {
          const source = await repo.findById(body.copyFrom, tx);
          if (!source) throw new AppError('FORM_NOT_FOUND', '복사할 서식이 없습니다.');
          draft = source.draft as unknown as FormDefinition;
        }
        const { id } = await repo.create(tx, { key: body.key, formNo: body.formNo, draft, actor, at: new Date() });
        return adminItem(tx, id);
      });
      await auditRepository.log(actor, 'form.create', item.id, {
        key: body.key, formNo: body.formNo, ...(body.copyFrom ? { copyFrom: body.copyFrom } : {}),
      });
      return item;
    } catch (e) {
      return rethrowTaken(e, body.key, body.formNo);
    }
  },

  async saveDraft(id: string, body: SaveDraftBody, actor: string) {
    try {
      const item = await repo.transaction(async (tx) => {
        const form = await lockOrNotFound(tx, id);
        checkBase(form, body.baseUpdatedAt);
        const key = body.key ?? form.key;
        const formNo = body.formNo ?? form.formNo;
        if (key !== form.key || formNo !== form.formNo) await assertFree(tx, key, formNo, id);
        await repo.updateDraft(tx, id, { draft: body.definition, key: body.key, formNo: body.formNo, actor, at: new Date() });
        return adminItem(tx, id);
      });
      await auditRepository.log(actor, 'form.update', id, { key: item.key, formNo: item.formNo });
      return item;
    } catch (e) {
      return rethrowTaken(e, body.key ?? '', body.formNo ?? 0, id);
    }
  },

  /** 전체 검사 후 새 판. 문제가 있으면 FORM_INVALID + details */
  async publish(id: string, body: PublishBody, actor: string) {
    const item = await repo.transaction(async (tx) => {
      const form = await lockOrNotFound(tx, id);
      checkBase(form, body.baseUpdatedAt);
      const parsed = parseStored(form.draft);
      if ('problems' in parsed) throw new AppError('FORM_INVALID', undefined, parsed.problems);
      const sizes = await repo.findImageSizes(tx, parsed.def.pages.map((p) => p.imageId));
      const problems = validateDefinition(parsed.def, sizes);
      if (problems.length) throw new AppError('FORM_INVALID', undefined, problems);
      const version = (await repo.lastVersion(tx, id)) + 1;
      await repo.insertVersion(tx, id, version, parsed.def, actor);
      await repo.setPublished(tx, id, version);
      return adminItem(tx, id);
    });
    await auditRepository.log(actor, 'form.publish', id, { key: item.key, version: item.publishedVersion });
    return item;
  },

  /** 지운 서식은 이용자에게 안 보이고 관리자 목록에서도 빠진다. 판은 남긴다 */
  async remove(id: string, actor: string) {
    const { key } = await repo.transaction(async (tx) => {
      await lockOrNotFound(tx, id);
      return repo.softDelete(tx, id);
    });
    await auditRepository.log(actor, 'form.delete', id, { key });
  },

  async versions(id: string) {
    const form = await repo.findById(id);
    if (!form) throw new AppError('FORM_NOT_FOUND');
    const rows = await repo.listVersions(id);
    return rows.map((v) => ({ ...v, isPublished: v.version === form.publishedVersion }));
  },

  /** 그 판을 초안으로 복사한다 (공개는 따로) */
  async restore(id: string, version: number, actor: string) {
    const item = await repo.transaction(async (tx) => {
      await lockOrNotFound(tx, id);
      const v = await repo.findVersion(tx, id, version);
      if (!v) throw new AppError('FORM_NOT_FOUND', `${version}판이 없습니다.`);
      const parsed = parseStored(v.definition);
      if ('problems' in parsed) throw new AppError('FORM_INVALID', undefined, parsed.problems);
      await repo.updateDraft(tx, id, { draft: parsed.def, actor, at: new Date() });
      return adminItem(tx, id);
    });
    await auditRepository.log(actor, 'form.restore', id, { key: item.key, version });
    return item;
  },

  /** PNG만. id는 내용의 SHA-256 (같은 파일을 다시 올리면 같은 id) */
  async uploadImage(body: unknown, actor: string) {
    if (!Buffer.isBuffer(body)) throw new AppError('FORM_IMAGE_INVALID', 'Content-Type: image/png 로 PNG 파일을 보내 주세요.');
    const size = readPngSize(body);
    if (!size) throw new AppError('FORM_IMAGE_INVALID');
    const id = createHash('sha256').update(body).digest('hex');
    const created = await repo.insertImage(id, size.width, size.height, body);
    await auditRepository.log(actor, 'form_image.upload', id, { ...size, bytes: body.length, created });
    return { id, ...size };
  },
};
