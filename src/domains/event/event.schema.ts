import { z } from '../../config/zod.js';
import { EVENT_TYPES, EVENTS_NEEDING_FORM } from '../../constants/enums.js';
import { fieldIdSchema, formKeySchema, formNoSchema, langSchema } from '../../utils/common-schema.js';

export const MAX_EVENTS = 20;

// 서식에 적는 값(이름·주민등록번호 등)을 받을 칸은 일부러 두지 않는다. strict라 다른 칸이 섞이면 거부.
export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES).openapi({ example: 'form_view' }),
    lang: langSchema.optional(),
    formKey: formKeySchema.optional(),
    formNo: formNoSchema.optional(),
    fieldId: fieldIdSchema.optional(),
    category: z.string().trim().min(1).max(32).optional().openapi({ example: 'FAMILY' }),
    searchTerm: z.string().trim().min(1).max(100).optional().openapi({ example: 'khai sinh' }),
    resultCount: z.number().int().min(0).max(10000).optional().openapi({ description: '검색 결과 수', example: 0 }),
    durationSec: z.number().int().min(0).max(3600).optional().openapi({ description: '상세 화면 체류 초', example: 95 }),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (EVENTS_NEEDING_FORM.has(e.type) && e.formKey === undefined && e.formNo === undefined) {
      ctx.addIssue({ code: 'custom', path: ['formKey'], message: `${e.type}에는 formKey 또는 formNo가 필요합니다` });
    }
    if (e.type === 'field_open' && !e.fieldId) {
      ctx.addIssue({ code: 'custom', path: ['fieldId'], message: 'field_open에는 fieldId가 필요합니다' });
    }
    if (e.type === 'search' && !e.searchTerm) {
      ctx.addIssue({ code: 'custom', path: ['searchTerm'], message: 'search에는 searchTerm이 필요합니다' });
    }
    if (e.type === 'detail_time' && e.durationSec === undefined) {
      ctx.addIssue({ code: 'custom', path: ['durationSec'], message: 'detail_time에는 durationSec이 필요합니다' });
    }
  })
  .openapi('Event', {
    description:
      '종류별 필수: form_view·form_download·detail_time·fill_*·field_open → formKey 또는 formNo / field_open → fieldId / search → searchTerm / detail_time → durationSec',
  });
export type EventInput = z.infer<typeof eventSchema>;

export const createEventsBody = z
  .object({
    visitorId: z.uuid().openapi({ description: '브라우저에 저장한 무작위 값 (사람을 특정할 수 없음)', example: '11111111-1111-4111-8111-111111111111' }),
    events: z.array(eventSchema).min(1).max(MAX_EVENTS),
  })
  .openapi('CreateEventsBody');
export type CreateEventsBody = z.infer<typeof createEventsBody>;

export const acceptedData = z.object({ accepted: z.number().openapi({ example: 2 }) });
