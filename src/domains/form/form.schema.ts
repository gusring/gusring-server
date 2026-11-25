import { z } from '../../config/zod.js';
import { formKeySchema, formNoSchema } from '../../utils/common-schema.js';
import type { FormDefinition } from './form.types.js';

// 서식 정의 JSON의 모양. 기준은 gusring-web-v2 src/forms/types.ts (FormDef·FieldDef …) — 바꾸면 양쪽을 같이 바꾼다.
// 여기서는 모양(칸 이름·종류·숫자)만 본다. 비어 있는 입력칸·선택지 목록도 초안으로는 저장된다.
// 번역이 비었는지·좌표가 쪽 밖인지 같은 내용 검사는 공개할 때
// form-validate.ts가 한다 (고치는 중인 초안은 비어 있어도 저장되어야 하므로).

const text = (max = 2000) => z.string().max(max);
const coord = z.number().finite().min(-100000).max(100000);

/** 다국어 문자열 (5개 국어 모두 칸은 있어야 한다. 비어 있는지는 공개할 때 확인) */
export const langText = z
  .object({ ko: text(), en: text(), zh: text(), ja: text(), vi: text() })
  .strict()
  .openapi('FormLangText', { description: '5개 국어 문자열' });

export const FORM_CATEGORIES = ['FAMILY', 'CERT', 'RESIDENCE', 'ID_SEAL', 'VEHICLE'] as const;
export const formCategory = z.enum(FORM_CATEGORIES).openapi({ description: '분류', example: 'FAMILY' });

const box = z
  .object({ x: coord, y: coord, w: coord, h: coord, align: z.enum(['left', 'center', 'right']).optional() })
  .strict()
  .openapi('FormBox', { description: '원본 이미지 픽셀 단위 사각형' });
const point = z.object({ x: coord, y: coord }).strict().openapi('FormPoint');

const partFields = {
  key: text(64),
  box,
  label: langText.optional(),
  placeholder: text(200).optional(),
  hangul: z.boolean().optional(),
  korean: z.boolean().optional(),
  inputMode: z.enum(['text', 'tel', 'email', 'numeric']).optional(),
  options: z.array(z.object({ value: text(200), label: langText }).strict()).max(200).optional(),
};
const part = z.object(partFields).strict().openapi('FormPart');

const choiceOption = z
  .object({ value: text(200), label: langText, ko: text(200), mark: point })
  .strict()
  .openapi('FormChoiceOption');

const onlyOne = (a: unknown, b: unknown) => (a === undefined) !== (b === undefined);

const textInput = z.object({ kind: z.literal('text'), parts: z.array(part).max(50) }).strict();
const dateInput = z
  .object({
    kind: z.literal('date'),
    boxes: z.object({ y: box, m: box, d: box }).strict().optional(),
    box: box.optional(),
  })
  .strict()
  .refine((v) => onlyOne(v.boxes, v.box), 'date는 boxes와 box 중 하나만');
const datetimeInput = z
  .object({ kind: z.literal('datetime'), boxes: z.object({ y: box, m: box, d: box, h: box, min: box }).strict() })
  .strict();
const choiceInput = z
  .object({
    kind: z.literal('choice'),
    mark: z.enum(['circle', 'check']),
    multiple: z.boolean().optional(),
    options: z.array(choiceOption).max(100),
    extra: z.object({ ...partFields, when: z.array(text(200)).max(100).optional() }).strict().optional(),
  })
  .strict();
const countryInput = z
  .object({ kind: z.literal('country'), box, allowKorea: z.union([z.boolean(), z.literal('name')]).optional() })
  .strict();
const idnumInput = z
  .object({ kind: z.literal('idnum'), front: box.optional(), back: box.optional(), box: box.optional() })
  .strict()
  .refine((v) => (v.box ? !v.front && !v.back : Boolean(v.front && v.back)), 'idnum은 front·back 둘 다 또는 box 하나만');

export const inputSpec = z
  .discriminatedUnion('kind', [textInput, dateInput, datetimeInput, choiceInput, countryInput, idnumInput])
  .openapi('FormInputSpec', { description: 'text · date · datetime · choice · country · idnum' });

const copySource = z
  .object({ field: text(64), label: langText, map: z.record(z.string().max(64), z.string().max(64)) })
  .strict()
  .openapi('FormCopySource');

export const fieldDef = z
  .object({
    id: text(64),
    section: text(64),
    required: z.boolean().optional(),
    koLabel: text(200),
    label: langText,
    help: langText,
    area: box,
    input: inputSpec,
    copyFrom: z.array(copySource).max(20).optional(),
    badge: z.literal('margin').optional(),
    badgeAt: point.optional(),
    page: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .openapi('FormField');

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 16진수 64자');

const pageFields = {
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  marginX: coord.optional(),
};
export const formPage = z
  .object({ imageId: sha256.openapi({ description: 'POST /api/v1/admin/form-images 가 돌려준 id' }), ...pageFields })
  .strict()
  .openapi('FormPage');

const definitionFields = {
  title: langText,
  desc: langText,
  category: formCategory,
  /** 처음부터 채워 둘 값 (칸 id → 입력값) */
  preset: z.record(z.string().max(64), z.record(z.string().max(64), z.string().max(500))).optional(),
  sections: z.array(z.object({ id: text(64), label: langText }).strict()).max(100),
  fields: z.array(fieldDef).max(500),
};

/** 관리자가 저장하는 서식 정의 (초안·판 모두 이 모양) */
export const formDefinition = z
  .object({ ...definitionFields, pages: z.array(formPage).max(50) })
  .strict()
  .openapi('FormDefinition', { description: '서식 정의 전체. 기준은 gusring-web-v2 src/forms/types.ts' });
// 통과한 값의 타입은 web-v2와 같은 TS 타입(form.types.ts)으로 쓴다 (zod 추론 타입보다 종류별로 좁다)
export type { FormDefinition };
/** zod 검사를 통과한 값 → TS 타입 (date·idnum은 refine으로 한 가지 형태만 남는다) */
export const asDefinition = (v: z.infer<typeof formDefinition>) => v as unknown as FormDefinition;

// ── 요청 ──

export const formIdParams = z.object({ id: z.uuid().openapi({ example: '4649b09e-ccef-4a29-bd1e-4765fabae66b' }) });
export const formKeyParams = z.object({ key: formKeySchema });
export const versionParams = formIdParams.extend({
  version: z.coerce.number().int().min(1).max(1_000_000).openapi({ example: 1 }),
});
export const imageIdParams = z.object({ id: sha256.openapi({ description: '이미지 내용의 SHA-256' }) });

const baseUpdatedAt = z.iso
  .datetime({ offset: true })
  .openapi({ description: '불러올 때 받은 draftUpdatedAt. 그 뒤 다른 사람이 저장했으면 FORM_CONFLICT', example: '2026-11-25T05:05:32.123Z' });

export const createFormBody = z
  .object({
    key: formKeySchema,
    formNo: formNoSchema,
    definition: formDefinition.optional(),
    copyFrom: z.uuid().optional().openapi({ description: '이 서식의 초안을 복사해서 만든다 (definition과 같이 못 씀)' }),
  })
  .strict()
  .refine((b) => !(b.definition && b.copyFrom), { message: 'definition과 copyFrom은 같이 쓸 수 없습니다', path: ['copyFrom'] })
  .openapi('CreateFormBody');
export type CreateFormBody = Omit<z.infer<typeof createFormBody>, 'definition'> & { definition?: FormDefinition };

export const saveDraftBody = z
  .object({ definition: formDefinition.optional(), key: formKeySchema.optional(), formNo: formNoSchema.optional(), baseUpdatedAt })
  .strict()
  .openapi('SaveFormDraftBody');
export type SaveDraftBody = Omit<z.infer<typeof saveDraftBody>, 'definition'> & { definition?: FormDefinition };

export const publishBody = z
  .object({ baseUpdatedAt: baseUpdatedAt.optional() })
  .strict()
  .default({})
  .openapi('PublishFormBody', { description: '본문은 없어도 된다. baseUpdatedAt을 주면 그 뒤 바뀐 초안은 공개하지 않는다' });
export type PublishBody = z.infer<typeof publishBody>;

// ── 응답 ──

const dateTime = z.string().openapi({ format: 'date-time' });

export const publicFormListItem = z
  .object({ key: z.string(), formNo: z.number(), category: formCategory, title: langText, desc: langText, version: z.number() })
  .openapi('PublicFormListItem');

export const publicFormItem = z
  .object({ key: z.string(), formNo: z.number(), version: z.number(), definition: formDefinition.openapi({ description: '쪽 이미지는 /api/v1/form-images/{pages[].imageId}' }) })
  .openapi('PublicForm');

const adminMeta = {
  id: z.uuid(),
  key: z.string(),
  formNo: z.number(),
  draftUpdatedAt: dateTime.openapi({ description: '저장할 때 baseUpdatedAt으로 그대로 돌려보낸다' }),
  draftUpdatedBy: z.string(),
  publishedVersion: z.number().nullable().openapi({ description: 'NULL이면 이용자에게 안 보임' }),
};

export const adminFormListItem = z
  .object({
    ...adminMeta,
    category: formCategory,
    title: langText,
    publishedAt: dateTime.nullable().openapi({ description: '공개한 판의 공개 시각 (공개한 적 없으면 NULL)' }),
    hasUnpublishedChanges: z.boolean().openapi({ description: '초안이 공개한 판과 다름 (공개한 적 없으면 true)' }),
  })
  .openapi('AdminFormListItem');

export const adminFormItem = z
  .object({ ...adminMeta, draft: formDefinition })
  .openapi('AdminForm');

export const publishResult = z.object({ version: z.number() }).openapi('PublishFormResult');

export const formConflictDetails = z
  .object({ draftUpdatedAt: dateTime, draftUpdatedBy: z.string() })
  .openapi('FormConflictDetails', { description: 'FORM_CONFLICT의 details: 지금 저장된 초안의 시각·저장한 사람' });

export const formProblem = z
  .object({ fieldId: z.string().optional(), message: z.string() })
  .openapi('FormProblem', { description: 'FORM_INVALID의 details 항목 (fieldId가 없으면 서식 전체)' });

export const formVersionItem = z
  .object({ version: z.number(), publishedBy: z.string(), publishedAt: dateTime })
  .openapi('FormVersion');

export const formImageItem = z
  .object({ id: z.string(), width: z.number(), height: z.number() })
  .openapi('FormImage');
