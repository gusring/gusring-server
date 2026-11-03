import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Lang } from '../../constants/enums.js';
import type { DateRange } from '../../utils/date-range.js';

// 집계 SQL. 값은 모두 Prisma.sql 파라미터로 넘긴다 (문자열 이어붙이기 없음).
// count()는 bigint로 오므로 서비스에서 숫자로 바꾼다.

const inRange = (r: DateRange) => Prisma.sql`created_at >= ${r.start} AND created_at < ${r.end}`;
export const TOP = 20;

type Row = Record<string, unknown>;
type TermRow = { term: string; count: bigint };

export const statsRepository = {
  totals: (r: DateRange) => prisma().$queryRaw<Row[]>`
    SELECT count(DISTINCT visitor_id)                                       AS visitors,
           count(*) FILTER (WHERE type = 'form_view')                       AS form_views,
           count(*) FILTER (WHERE type = 'form_download')                   AS form_downloads,
           count(*) FILTER (WHERE type = 'fill_start')                      AS fill_starts,
           count(*) FILTER (WHERE type = 'fill_preview')                    AS fill_previews,
           count(*) FILTER (WHERE type IN ('fill_png_save', 'fill_print'))  AS fill_outputs
    FROM usage_event WHERE ${inRange(r)}`,

  visitorsByLang: (r: DateRange) => prisma().$queryRaw<{ lang: Lang; visitors: bigint }[]>`
    SELECT lang::text AS lang, count(DISTINCT visitor_id) AS visitors
    FROM usage_event WHERE lang IS NOT NULL AND ${inRange(r)}
    GROUP BY lang ORDER BY visitors DESC, lang`,

  forms: (r: DateRange, lang?: Lang) => {
    const langFilter = lang ? Prisma.sql`AND lang = CAST(${lang} AS lang)` : Prisma.empty;
    return prisma().$queryRaw<{ form_key: string | null; form_no: number | null; views: bigint; downloads: bigint }[]>`
      SELECT form_key, form_no,
             count(*) FILTER (WHERE type = 'form_view')     AS views,
             count(*) FILTER (WHERE type = 'form_download') AS downloads
      FROM usage_event
      WHERE type IN ('form_view', 'form_download') AND ${inRange(r)} ${langFilter}
      GROUP BY form_key, form_no
      ORDER BY views DESC, downloads DESC, form_no NULLS LAST, form_key NULLS LAST`;
  },

  /** 빈 날도 0으로 나오게 날짜 목록에 붙인다 */
  daily: (r: DateRange) => prisma().$queryRaw<{ day: string; visitors: bigint; views: bigint; downloads: bigint }[]>`
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
    GROUP BY days.day ORDER BY days.day`,

  topSearchTerms: (r: DateRange) => prisma().$queryRaw<TermRow[]>`
    SELECT lower(search_term) AS term, count(*) AS count
    FROM usage_event WHERE type = 'search' AND ${inRange(r)}
    GROUP BY 1 ORDER BY count DESC, term LIMIT ${TOP}`,

  zeroResultTerms: (r: DateRange) => prisma().$queryRaw<TermRow[]>`
    SELECT lower(search_term) AS term, count(*) AS count
    FROM usage_event WHERE type = 'search' AND result_count = 0 AND ${inRange(r)}
    GROUP BY 1 ORDER BY count DESC, term LIMIT ${TOP}`,

  fillForms: (r: DateRange) => prisma().$queryRaw<Row[]>`
    SELECT form_key, form_no,
           count(*) FILTER (WHERE type = 'fill_start')                     AS starts,
           count(*) FILTER (WHERE type = 'fill_preview')                   AS previews,
           count(*) FILTER (WHERE type IN ('fill_png_save', 'fill_print')) AS outputs,
           count(*) FILTER (WHERE type = 'fill_reset')                     AS resets
    FROM usage_event
    WHERE type IN ('fill_start', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset') AND ${inRange(r)}
    GROUP BY form_key, form_no ORDER BY starts DESC, form_key NULLS LAST`,

  topFields: (r: DateRange) => prisma().$queryRaw<{ form_key: string | null; field_id: string; opens: bigint }[]>`
    SELECT form_key, field_id, count(*) AS opens
    FROM usage_event WHERE type = 'field_open' AND ${inRange(r)}
    GROUP BY form_key, field_id ORDER BY opens DESC, form_key, field_id LIMIT ${TOP}`,

  formsByLang: (r: DateRange) => prisma().$queryRaw<
    { form_key: string | null; form_no: number | null; lang: string | null; views: bigint; downloads: bigint }[]
  >`
    SELECT form_key, form_no, lang::text AS lang,
           count(*) FILTER (WHERE type = 'form_view')     AS views,
           count(*) FILTER (WHERE type = 'form_download') AS downloads
    FROM usage_event
    WHERE type IN ('form_view', 'form_download') AND ${inRange(r)}
    GROUP BY form_key, form_no, lang
    ORDER BY form_no NULLS LAST, form_key NULLS LAST, lang NULLS LAST`,
};
