import express, { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { parse } from '../lib/validate.js';
import { HttpError } from '../middlewares/error-handler.js';
import { fieldIdSchema, formKeySchema, formNoSchema, langSchema } from '../lib/common-schema.js';

export const EVENT_TYPES = [
  // gusring-web (GA4와 같은 종류)
  'landing_view', 'list_view', 'form_view', 'form_download', 'language_select',
  'search', 'category_filter', 'feedback_click', 'detail_time',
  // 서식 작성 도우미
  'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset',
] as const;

/** 서식이 꼭 있어야 하는 이벤트 */
const NEEDS_FORM = new Set<string>([
  'form_view', 'form_download', 'detail_time',
  'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset',
]);

export const MAX_EVENTS = 20;

// 입력 내용(이름·주민등록번호 등)을 받을 칸은 일부러 두지 않는다.
const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    lang: langSchema.optional(),
    formKey: formKeySchema.optional(),
    formNo: formNoSchema.optional(),
    fieldId: fieldIdSchema.optional(),
    category: z.string().trim().min(1).max(32).optional(),
    searchTerm: z.string().trim().min(1).max(100).optional(),
    resultCount: z.number().int().min(0).max(10000).optional(),
    durationSec: z.number().int().min(0).max(3600).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (NEEDS_FORM.has(e.type) && e.formKey === undefined && e.formNo === undefined) {
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
  });

const bodySchema = z.object({
  visitorId: z.uuid(),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS),
});

export const eventsRouter = Router();

// navigator.sendBeacon은 본문을 text/plain으로 보낸다 → 문자열이면 JSON으로 읽는다
eventsRouter.use(express.text({ type: 'text/plain', limit: '64kb' }));

function readBody(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', '요청 형식이 올바르지 않습니다.');
  }
}

eventsRouter.post('/', async (req, res) => {
  const body = parse(bodySchema, readBody(req.body));
  const { count } = await db().usageEvent.createMany({
    data: body.events.map((e) => ({
      type: e.type,
      lang: e.lang ?? null,
      formKey: e.formKey ?? null,
      formNo: e.formNo ?? null,
      fieldId: e.fieldId ?? null,
      category: e.category ?? null,
      searchTerm: e.searchTerm ?? null,
      resultCount: e.resultCount ?? null,
      durationSec: e.durationSec ?? null,
      visitorId: body.visitorId,
    })),
  });
  res.status(202).json({ accepted: count });
});
