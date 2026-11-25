import { z } from '../../config/zod.js';
import { dateRangeQuery, langSchema } from '../../utils/common-schema.js';

// ── 요청 ──
export const statsQuery = dateRangeQuery.openapi('StatsQuery');
export const formStatsQuery = dateRangeQuery.extend({ lang: langSchema.optional() }).openapi('FormStatsQuery');
export type StatsQuery = z.infer<typeof statsQuery>;
export type FormStatsQuery = z.infer<typeof formStatsQuery>;

// ── 응답 (Swagger 문서용) ──
const period = {
  from: z.string().openapi({ example: '2026-11-01' }),
  to: z.string().openapi({ example: '2026-11-30' }),
};
const nullableFormKey = z.string().nullable().openapi({ example: 'birth-report' });
const nullableFormNo = z.number().nullable().openapi({ example: 4 });

export const summaryData = z
  .object({
    ...period,
    visitors: z.number().openapi({ description: '방문자 수 (visitorId 기준 중복 제외)' }),
    formViews: z.number(),
    formDownloads: z.number(),
    fillStarts: z.number(),
    fillPreviews: z.number(),
    fillOutputs: z.number().openapi({ description: 'PNG 저장 + 인쇄' }),
    visitorsByLang: z.array(z.object({ lang: langSchema, visitors: z.number() })),
  })
  .openapi('StatsSummary');

export const formsData = z
  .object({
    ...period,
    lang: langSchema.nullable(),
    items: z.array(z.object({ formKey: nullableFormKey, formNo: nullableFormNo, views: z.number(), downloads: z.number() })),
  })
  .openapi('StatsForms');

export const dailyData = z
  .object({
    ...period,
    days: z.array(z.object({ day: z.string().openapi({ example: '2026-11-03' }), visitors: z.number(), views: z.number(), downloads: z.number() })),
  })
  .openapi('StatsDaily');

const termCount = z.object({ term: z.string(), count: z.number() });
export const searchData = z
  .object({ ...period, top: z.array(termCount), zeroResult: z.array(termCount).openapi({ description: '결과가 0건이었던 검색어' }) })
  .openapi('StatsSearch');

export const fillData = z
  .object({
    ...period,
    forms: z.array(
      z.object({ formKey: nullableFormKey, formNo: nullableFormNo, starts: z.number(), previews: z.number(), outputs: z.number(), resets: z.number() }),
    ),
    topFields: z.array(z.object({ formKey: nullableFormKey, fieldId: z.string(), opens: z.number() })).openapi({ description: '안내를 많이 연 칸' }),
  })
  .openapi('StatsFill');
