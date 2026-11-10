import { z } from '../../config/zod.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from '../../constants/enums.js';
import { fieldIdSchema, formKeySchema, formNoSchema, langSchema, pageQuery } from '../../utils/common-schema.js';

export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES).openapi({
  description: 'general 일반 의견 · translation 번역 오류 · guide 칸 안내 오류 · bug 사이트 오류',
  example: 'guide',
});
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES).openapi({ description: '처리 상태', example: 'new' });

export const createFeedbackBody = z
  .object({
    lang: langSchema,
    formKey: formKeySchema.optional(),
    formNo: formNoSchema.optional(),
    fieldId: fieldIdSchema.optional(),
    type: feedbackTypeSchema.default('general'),
    message: z.string().trim().min(1, '내용을 입력해 주세요').max(2000, '2000자 이하').openapi({ example: 'この欄の説明が分かりにくいです' }),
    website: z.string().optional().openapi({ description: '봇 걸러내기용 숨은 칸. 화면에 보이지 않게 두고 비워서 보낸다' }),
  })
  .openapi('CreateFeedbackBody');
export type CreateFeedbackBody = z.infer<typeof createFeedbackBody>;

export const feedbackIdParams = z.object({
  feedbackId: z.uuid().openapi({ example: '4649b09e-ccef-4a29-bd1e-4765fabae66b' }),
});

export const listFeedbackQuery = pageQuery.extend({
  status: feedbackStatusSchema.optional(),
  lang: langSchema.optional(),
  formKey: formKeySchema.optional(),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuery>;

export const updateFeedbackBody = z.object({ status: feedbackStatusSchema }).strict().openapi('UpdateFeedbackBody');

// ── 응답 ──
export const feedbackIdData = z.object({ id: z.uuid().nullable().openapi({ description: '봇으로 걸러진 경우 null' }) });

export const feedbackItem = z
  .object({
    id: z.uuid(),
    lang: langSchema,
    formKey: z.string().nullable(),
    formNo: z.number().nullable(),
    fieldId: z.string().nullable(),
    type: feedbackTypeSchema,
    message: z.string(),
    status: feedbackStatusSchema,
    createdAt: z.string().openapi({ format: 'date-time' }),
    updatedAt: z.string().openapi({ format: 'date-time' }),
  })
  .openapi('Feedback');
