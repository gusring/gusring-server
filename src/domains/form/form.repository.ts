import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { FormDefinition } from './form.schema.js';

type Db = Prisma.TransactionClient;

const json = (def: FormDefinition) => def as unknown as Prisma.InputJsonValue;

/** 공개한 판 = form.published_version이 가리키는 form_version (지운 서식 제외) */
const publishedJoin = Prisma.sql`
  FROM form f JOIN form_version v ON v.form_id = f.id AND v.version = f.published_version
  WHERE f.deleted_at IS NULL`;

export type AdminFormRow = {
  id: string; key: string; form_no: number; title: unknown; category: string;
  draft_updated_at: Date; draft_updated_by: string; published_version: number | null; published_at: Date | null;
  has_unpublished_changes: boolean;
};

const adminMeta = {
  id: true, key: true, formNo: true, draft: true, draftUpdatedAt: true, draftUpdatedBy: true,
  publishedVersion: true,
} as const;

export const formRepository = {
  transaction: <T>(fn: (tx: Db) => Promise<T>) => prisma().$transaction(fn),

  // ── 공개 ──
  findPublishedList: () => prisma().$queryRaw<
    { key: string; form_no: number; version: number; category: string; title: unknown; desc: unknown }[]
  >`
    SELECT f.key, f.form_no, f.published_version AS version,
           v.definition->>'category' AS category, v.definition->'title' AS title, v.definition->'desc' AS desc
    ${publishedJoin}
    ORDER BY f.form_no`,

  findPublishedByKey: async (key: string) => {
    const rows = await prisma().$queryRaw<{ key: string; form_no: number; version: number; definition: unknown }[]>`
      SELECT f.key, f.form_no, f.published_version AS version, v.definition
      ${publishedJoin} AND f.key = ${key}`;
    return rows[0] ?? null;
  },

  // ── 관리자 ──
  /** jsonb 비교라 칸 순서가 달라도 같은 내용이면 같다고 본다 */
  findAdminList: () => prisma().$queryRaw<AdminFormRow[]>`
    SELECT f.id, f.key, f.form_no, f.draft->'title' AS title, f.draft->>'category' AS category,
           f.draft_updated_at, f.draft_updated_by, f.published_version, v.published_at,
           (v.definition IS NULL OR v.definition <> f.draft) AS has_unpublished_changes
    FROM form f LEFT JOIN form_version v ON v.form_id = f.id AND v.version = f.published_version
    WHERE f.deleted_at IS NULL
    ORDER BY f.form_no`,

  findById: (id: string, db: Db = prisma()) =>
    db.form.findFirst({ where: { id, deletedAt: null }, select: adminMeta }),

  /** 바꾸기 전에 그 서식 줄을 잠근다 (동시에 저장·공개하면 한 번에 하나씩) */
  lock: async (tx: Db, id: string) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM form WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    return rows.length > 0;
  },

  /** 지운 서식도 key·formNo 자리를 차지한다 */
  findTaken: (db: Db, key: string, formNo: number, exceptId?: string) =>
    db.form.findMany({
      where: { OR: [{ key }, { formNo }], ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { key: true, formNo: true },
    }),

  findByKeyAnyState: (key: string) => prisma().form.findUnique({ where: { key }, select: { id: true, deletedAt: true } }),

  create: (db: Db, data: { key: string; formNo: number; draft: FormDefinition; actor: string; at: Date }) =>
    db.form.create({
      data: { key: data.key, formNo: data.formNo, draft: json(data.draft), draftUpdatedAt: data.at, draftUpdatedBy: data.actor },
      select: { id: true },
    }),

  updateDraft: (db: Db, id: string, data: { draft?: FormDefinition; key?: string; formNo?: number; actor: string; at: Date }) =>
    db.form.update({
      where: { id },
      data: { draft: data.draft && json(data.draft), key: data.key, formNo: data.formNo, draftUpdatedAt: data.at, draftUpdatedBy: data.actor },
    }),

  softDelete: (db: Db, id: string) =>
    db.form.update({ where: { id }, data: { deletedAt: new Date(), publishedVersion: null }, select: { key: true } }),

  lastVersion: async (db: Db, formId: string) =>
    (await db.formVersion.aggregate({ where: { formId }, _max: { version: true } }))._max.version ?? 0,

  insertVersion: (db: Db, formId: string, version: number, definition: FormDefinition, actor: string) =>
    db.formVersion.create({ data: { formId, version, definition: json(definition), publishedBy: actor } }),

  setPublished: (db: Db, id: string, version: number) =>
    db.form.update({ where: { id }, data: { publishedVersion: version } }),

  listVersions: (formId: string) =>
    prisma().formVersion.findMany({
      where: { formId },
      select: { version: true, publishedBy: true, publishedAt: true },
      orderBy: { version: 'desc' },
    }),

  findVersion: (db: Db, formId: string, version: number) =>
    db.formVersion.findUnique({ where: { formId_version: { formId, version } }, select: { definition: true } }),

  // ── 이미지 ──
  findImageSizes: async (db: Db, ids: string[]) => {
    const rows = await db.formImage.findMany({ where: { id: { in: ids } }, select: { id: true, width: true, height: true } });
    return new Map(rows.map((r) => [r.id, { width: r.width, height: r.height }]));
  },

  /** 같은 내용(id)이면 새로 넣지 않는다. 새로 넣었으면 true */
  insertImage: async (id: string, width: number, height: number, bytes: Buffer) => {
    const { count } = await prisma().formImage.createMany({
      data: [{ id, width, height, bytes: new Uint8Array(bytes) }],
      skipDuplicates: true,
    });
    return count > 0;
  },

  findImage: (id: string) => prisma().formImage.findUnique({ where: { id }, select: { bytes: true } }),
};

export const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
