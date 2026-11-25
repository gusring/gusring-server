import { parseRange } from '../../utils/date-range.js';
import { statsRepository as repo } from './stats.repository.js';
import type { FormStatsQuery, StatsQuery } from './stats.schema.js';

const n = (v: unknown) => Number(v ?? 0);

export const statsService = {
  /** 기간 합계 */
  async summary(q: StatsQuery) {
    const r = parseRange(q);
    const [[totals], byLang] = await Promise.all([repo.totals(r), repo.visitorsByLang(r)]);
    return {
      from: r.from,
      to: r.to,
      visitors: n(totals?.visitors),
      formViews: n(totals?.form_views),
      formDownloads: n(totals?.form_downloads),
      fillStarts: n(totals?.fill_starts),
      fillPreviews: n(totals?.fill_previews),
      fillOutputs: n(totals?.fill_outputs),
      visitorsByLang: byLang.map((x) => ({ lang: x.lang, visitors: n(x.visitors) })),
    };
  },

  /** 서식별 조회·다운로드 */
  async forms(q: FormStatsQuery) {
    const r = parseRange(q);
    const rows = await repo.forms(r, q.lang);
    return {
      from: r.from,
      to: r.to,
      lang: q.lang ?? null,
      items: rows.map((x) => ({ formKey: x.form_key, formNo: x.form_no, views: n(x.views), downloads: n(x.downloads) })),
    };
  },

  /** 날짜별 (빈 날은 0) */
  async daily(q: StatsQuery) {
    const r = parseRange(q);
    const rows = await repo.daily(r);
    return {
      from: r.from,
      to: r.to,
      days: rows.map((x) => ({ day: x.day, visitors: n(x.visitors), views: n(x.views), downloads: n(x.downloads) })),
    };
  },

  /** 많이 찾은 검색어 / 결과 0건 검색어 */
  async search(q: StatsQuery) {
    const r = parseRange(q);
    const [top, zero] = await Promise.all([repo.topSearchTerms(r), repo.zeroResultTerms(r)]);
    const conv = (rows: { term: string; count: bigint }[]) => rows.map((x) => ({ term: x.term, count: n(x.count) }));
    return { from: r.from, to: r.to, top: conv(top), zeroResult: conv(zero) };
  },

  /** 서식 작성 도우미: 서식별 단계 수, 안내를 많이 연 칸 */
  async fill(q: StatsQuery) {
    const r = parseRange(q);
    const [forms, fields] = await Promise.all([repo.fillForms(r), repo.topFields(r)]);
    return {
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
    };
  },

  /** 서식 × 언어 표 CSV (엑셀에서 한글이 깨지지 않게 BOM) */
  async exportCsv(q: StatsQuery) {
    const r = parseRange(q);
    const rows = await repo.formsByLang(r);
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ['form_key', 'form_no', 'lang', 'views', 'downloads'].join(','),
      ...rows.map((x) => [x.form_key, x.form_no, x.lang, n(x.views), n(x.downloads)].map(cell).join(',')),
    ];
    return { filename: `gusring-stats-${r.from}_${r.to}.csv`, body: '﻿' + lines.join('\r\n') + '\r\n' };
  },
};
