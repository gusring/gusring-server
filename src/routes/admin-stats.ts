import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { parseRange, type DateRange } from '../lib/date-range.js';
import { parse } from '../lib/validate.js';
import { langSchema } from '../lib/common-schema.js';

// 집계 SQL. 값은 모두 Prisma.sql 파라미터로 넘긴다 (문자열 이어붙이기 없음).
// count()는 bigint로 오므로 숫자로 바꿔 돌려준다.

const n = (v: unknown) => Number(v ?? 0);
const inRange = (r: DateRange) => Prisma.sql`created_at >= ${r.start} AND created_at < ${r.end}`;
const TOP = 20;

export const adminStatsRouter = Router();

/** 기간 합계 */
adminStatsRouter.get('/summary', async (req, res) => {
  const r = parseRange(req.query);
  const [totals] = await db().$queryRaw<Record<string, unknown>[]>`
    SELECT count(DISTINCT visitor_id)                                       AS visitors,
           count(*) FILTER (WHERE type = 'form_view')                       AS form_views,
           count(*) FILTER (WHERE type = 'form_download')                   AS form_downloads,
           count(*) FILTER (WHERE type = 'fill_start')                      AS fill_starts,
           count(*) FILTER (WHERE type = 'fill_preview')                    AS fill_previews,
           count(*) FILTER (WHERE type IN ('fill_png_save', 'fill_print'))  AS fill_outputs
    FROM usage_event WHERE ${inRange(r)}`;
  const byLang = await db().$queryRaw<{ lang: string; visitors: bigint }[]>`
    SELECT lang::text AS lang, count(DISTINCT visitor_id) AS visitors
    FROM usage_event WHERE lang IS NOT NULL AND ${inRange(r)}
    GROUP BY lang ORDER BY visitors DESC, lang`;
  res.json({
    from: r.from,
    to: r.to,
    visitors: n(totals?.visitors),
    formViews: n(totals?.form_views),
    formDownloads: n(totals?.form_downloads),
    fillStarts: n(totals?.fill_starts),
    fillPreviews: n(totals?.fill_previews),
    fillOutputs: n(totals?.fill_outputs),
    visitorsByLang: byLang.map((x) => ({ lang: x.lang, visitors: n(x.visitors) })),
  });
});

/** 서식별 조회·다운로드 */
adminStatsRouter.get('/forms', async (req, res) => {
  const r = parseRange(req.query);
  const { lang } = parse(z.object({ lang: langSchema.optional() }).passthrough(), req.query);
  const langFilter = lang ? Prisma.sql`AND lang = CAST(${lang} AS lang)` : Prisma.empty;
  const rows = await db().$queryRaw<{ form_key: string | null; form_no: number | null; views: bigint; downloads: bigint }[]>`
    SELECT form_key, form_no,
           count(*) FILTER (WHERE type = 'form_view')     AS views,
           count(*) FILTER (WHERE type = 'form_download') AS downloads
    FROM usage_event
    WHERE type IN ('form_view', 'form_download') AND ${inRange(r)} ${langFilter}
    GROUP BY form_key, form_no
    ORDER BY views DESC, downloads DESC, form_no NULLS LAST, form_key NULLS LAST`;
  res.json({
    from: r.from,
    to: r.to,
    lang: lang ?? null,
    items: rows.map((x) => ({ formKey: x.form_key, formNo: x.form_no, views: n(x.views), downloads: n(x.downloads) })),
  });
});

/** 날짜별 (빈 날은 0) */
adminStatsRouter.get('/daily', async (req, res) => {
  const r = parseRange(req.query);
  const rows = await db().$queryRaw<{ day: string; visitors: bigint; views: bigint; downloads: bigint }[]>`
    WITH days AS (
      SELECT generate_series(${r.from}::date, ${r.to}::date, interval '1 day')::date AS day
    ), ev AS (
      SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS day, visitor_id, type
      FROM usage_event WHERE ${inRange(r)}
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
           count(DISTINCT ev.visitor_id)                     AS visitors,
           count(ev.type) FILTER (WHERE ev.type = 'form_view')     AS views,
           count(ev.type) FILTER (WHERE ev.type = 'form_download') AS downloads
    FROM days LEFT JOIN ev ON ev.day = days.day
    GROUP BY days.day ORDER BY days.day`;
  res.json({
    from: r.from,
    to: r.to,
    days: rows.map((x) => ({ day: x.day, visitors: n(x.visitors), views: n(x.views), downloads: n(x.downloads) })),
  });
});

/** 많이 찾은 검색어 / 결과 0건 검색어 */
adminStatsRouter.get('/search', async (req, res) => {
  const r = parseRange(req.query);
  const top = await db().$queryRaw<{ term: string; count: bigint }[]>`
    SELECT lower(search_term) AS term, count(*) AS count
    FROM usage_event WHERE type = 'search' AND ${inRange(r)}
    GROUP BY 1 ORDER BY count DESC, term LIMIT ${TOP}`;
  const zero = await db().$queryRaw<{ term: string; count: bigint }[]>`
    SELECT lower(search_term) AS term, count(*) AS count
    FROM usage_event WHERE type = 'search' AND result_count = 0 AND ${inRange(r)}
    GROUP BY 1 ORDER BY count DESC, term LIMIT ${TOP}`;
  const conv = (rows: { term: string; count: bigint }[]) => rows.map((x) => ({ term: x.term, count: n(x.count) }));
  res.json({ from: r.from, to: r.to, top: conv(top), zeroResult: conv(zero) });
});

/** 서식 작성 도우미: 서식별 단계 수, 안내를 많이 연 칸 */
adminStatsRouter.get('/fill', async (req, res) => {
  const r = parseRange(req.query);
  const forms = await db().$queryRaw<Record<string, unknown>[]>`
    SELECT form_key, form_no,
           count(*) FILTER (WHERE type = 'fill_start')                     AS starts,
           count(*) FILTER (WHERE type = 'fill_preview')                   AS previews,
           count(*) FILTER (WHERE type IN ('fill_png_save', 'fill_print')) AS outputs,
           count(*) FILTER (WHERE type = 'fill_reset')                     AS resets
    FROM usage_event
    WHERE type IN ('fill_start', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset') AND ${inRange(r)}
    GROUP BY form_key, form_no ORDER BY starts DESC, form_key NULLS LAST`;
  const fields = await db().$queryRaw<{ form_key: string | null; field_id: string; opens: bigint }[]>`
    SELECT form_key, field_id, count(*) AS opens
    FROM usage_event WHERE type = 'field_open' AND ${inRange(r)}
    GROUP BY form_key, field_id ORDER BY opens DESC, form_key, field_id LIMIT ${TOP}`;
  res.json({
    from: r.from,
    to: r.to,
    forms: forms.map((x) => ({
      formKey: x.form_key as string | null,
      formNo: x.form_no as number | null,
      starts: n(x.starts),
      previews: n(x.previews),
      outputs: n(x.outputs),
      resets: n(x.resets),
    })),
    topFields: fields.map((x) => ({ formKey: x.form_key, fieldId: x.field_id, opens: n(x.opens) })),
  });
});

/** 서식 × 언어 표 CSV (엑셀에서 한글이 깨지지 않게 BOM) */
adminStatsRouter.get('/export.csv', async (req, res) => {
  const r = parseRange(req.query);
  const rows = await db().$queryRaw<{ form_key: string | null; form_no: number | null; lang: string | null; views: bigint; downloads: bigint }[]>`
    SELECT form_key, form_no, lang::text AS lang,
           count(*) FILTER (WHERE type = 'form_view')     AS views,
           count(*) FILTER (WHERE type = 'form_download') AS downloads
    FROM usage_event
    WHERE type IN ('form_view', 'form_download') AND ${inRange(r)}
    GROUP BY form_key, form_no, lang
    ORDER BY form_no NULLS LAST, form_key NULLS LAST, lang NULLS LAST`;
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['form_key', 'form_no', 'lang', 'views', 'downloads'].join(','),
    ...rows.map((x) => [x.form_key, x.form_no, x.lang, n(x.views), n(x.downloads)].map(cell).join(',')),
  ];
  res
    .type('text/csv; charset=utf-8')
    .attachment(`gusring-stats-${r.from}_${r.to}.csv`)
    .send('﻿' + lines.join('\r\n') + '\r\n');
});
