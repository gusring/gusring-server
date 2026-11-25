import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { ADMIN, useCleanDb, VISITOR, VISITOR2 } from './helpers.js';

const app = createApp();
useCleanDb();

type Ev = Parameters<ReturnType<typeof prisma>['usageEvent']['create']>[0]['data'];

/** 한국 시간 "2026-11-01T09:00"을 UTC 시각으로 */
const kst = (s: string) => new Date(`${s}+09:00`);

async function seed() {
  const ev = (createdAt: Date, e: Partial<Ev> & Pick<Ev, 'type'>, visitorId = VISITOR): Ev => ({ visitorId, createdAt, ...e });
  await prisma().usageEvent.createMany({
    data: [
      // 11-01 (한국): 방문자 2명
      ev(kst('2026-11-01T09:00:00'), { type: 'form_view', lang: 'ja', formNo: 4 }),
      ev(kst('2026-11-01T09:01:00'), { type: 'form_download', lang: 'ja', formNo: 4 }),
      ev(kst('2026-11-01T10:00:00'), { type: 'form_view', lang: 'vi', formNo: 6 }, VISITOR2),
      ev(kst('2026-11-01T10:01:00'), { type: 'form_view', lang: 'vi', formNo: 4 }, VISITOR2),
      // 한국 날짜 경계: UTC 10-31 15:30 = 한국 11-01 00:30 → 11-01로 세야 함
      ev(new Date('2026-10-31T15:30:00Z'), { type: 'form_view', lang: 'ko', formNo: 6 }),
      // UTC 11-01 15:30 = 한국 11-02 00:30 → 11-01에 들어가면 안 됨
      ev(new Date('2026-11-01T15:30:00Z'), { type: 'form_view', lang: 'ko', formNo: 6 }),
      // 11-03: 검색·작성 도우미
      ev(kst('2026-11-03T12:00:00'), { type: 'search', lang: 'vi', searchTerm: 'Khai Sinh', resultCount: 0 }),
      ev(kst('2026-11-03T12:00:01'), { type: 'search', lang: 'vi', searchTerm: 'khai sinh', resultCount: 0 }),
      ev(kst('2026-11-03T12:00:02'), { type: 'search', lang: 'en', searchTerm: 'birth', resultCount: 3 }),
      ev(kst('2026-11-03T13:00:00'), { type: 'fill_start', lang: 'zh', formKey: 'birth-report' }),
      ev(kst('2026-11-03T13:01:00'), { type: 'field_open', lang: 'zh', formKey: 'birth-report', fieldId: 'childNameKo' }),
      ev(kst('2026-11-03T13:02:00'), { type: 'field_open', lang: 'zh', formKey: 'birth-report', fieldId: 'childNameKo' }),
      ev(kst('2026-11-03T13:03:00'), { type: 'field_open', lang: 'zh', formKey: 'birth-report', fieldId: 'sex' }),
      ev(kst('2026-11-03T13:04:00'), { type: 'fill_preview', lang: 'zh', formKey: 'birth-report' }),
      ev(kst('2026-11-03T13:05:00'), { type: 'fill_png_save', lang: 'zh', formKey: 'birth-report' }),
      ev(kst('2026-11-03T13:06:00'), { type: 'fill_print', lang: 'zh', formKey: 'birth-report' }),
    ],
  });
}

const get = (path: string) => request(app).get(path).set(ADMIN);

describe('GET /api/v1/admin/stats/summary', () => {
  it('하루(11-01, 한국 시간) 합계 — 날짜 경계 포함', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/summary?from=2026-11-01&to=2026-11-01');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ from: '2026-11-01', to: '2026-11-01', visitors: 2, formViews: 4, formDownloads: 1, fillStarts: 0 });
    expect(res.body.data.visitorsByLang).toEqual([
      { lang: 'ja', visitors: 1 },
      { lang: 'ko', visitors: 1 },
      { lang: 'vi', visitors: 1 },
    ]);
  });

  it('작성 도우미 수', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/summary?from=2026-11-03&to=2026-11-03');
    expect(res.body.data).toMatchObject({ fillStarts: 1, fillPreviews: 1, fillOutputs: 2, formViews: 0 });
  });

  it('데이터가 없으면 0', async () => {
    const res = await get('/api/v1/admin/stats/summary?from=2026-01-01&to=2026-01-31');
    expect(res.body.data).toMatchObject({ visitors: 0, formViews: 0, visitorsByLang: [] });
  });
});

describe('GET /api/v1/admin/stats/forms', () => {
  it('서식별 조회·다운로드, 많이 본 순', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/forms?from=2026-11-01&to=2026-11-02');
    expect(res.body.data.items).toEqual([
      { formKey: null, formNo: 6, views: 3, downloads: 0 },
      { formKey: null, formNo: 4, views: 2, downloads: 1 },
    ]);
  });

  it('언어로 거른다', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/forms?from=2026-11-01&to=2026-11-02&lang=vi');
    expect(res.body.data.items).toEqual([
      { formKey: null, formNo: 4, views: 1, downloads: 0 },
      { formKey: null, formNo: 6, views: 1, downloads: 0 },
    ]);
  });

  it('없는 언어는 400', async () => {
    expect((await get('/api/v1/admin/stats/forms?lang=fr')).status).toBe(400);
  });
});

describe('GET /api/v1/admin/stats/daily', () => {
  it('빈 날도 0으로 채워 날짜순으로 준다', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/daily?from=2026-10-31&to=2026-11-03');
    expect(res.body.data.days).toEqual([
      { day: '2026-10-31', visitors: 0, views: 0, downloads: 0 },
      { day: '2026-11-01', visitors: 2, views: 4, downloads: 1 },
      { day: '2026-11-02', visitors: 1, views: 1, downloads: 0 },
      { day: '2026-11-03', visitors: 1, views: 0, downloads: 0 },
    ]);
  });
});

describe('GET /api/v1/admin/stats/search', () => {
  it('대소문자를 합쳐 세고, 결과 0건 검색어를 따로 준다', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/search?from=2026-11-03&to=2026-11-03');
    expect(res.body.data.top).toEqual([
      { term: 'khai sinh', count: 2 },
      { term: 'birth', count: 1 },
    ]);
    expect(res.body.data.zeroResult).toEqual([{ term: 'khai sinh', count: 2 }]);
  });
});

describe('GET /api/v1/admin/stats/fill', () => {
  it('서식별 단계 수와 많이 연 칸', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/fill?from=2026-11-03&to=2026-11-03');
    expect(res.body.data.forms).toEqual([
      { formKey: 'birth-report', formNo: null, starts: 1, previews: 1, outputs: 2, resets: 0 },
    ]);
    expect(res.body.data.topFields).toEqual([
      { formKey: 'birth-report', fieldId: 'childNameKo', opens: 2 },
      { formKey: 'birth-report', fieldId: 'sex', opens: 1 },
    ]);
  });
});

describe('GET /api/v1/admin/stats/export', () => {
  it('BOM + 헤더 + 서식 × 언어 줄', async () => {
    await seed();
    const res = await get('/api/v1/admin/stats/export?from=2026-11-01&to=2026-11-01').buffer(true).parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (data += c));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('gusring-stats-2026-11-01_2026-11-01.csv');
    const text = res.body as string;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).split('\r\n').filter(Boolean)).toEqual([
      'form_key,form_no,lang,views,downloads',
      ',4,ja,1,1',
      ',4,vi,1,0',
      ',6,ko,1,0',
      ',6,vi,1,0',
    ]);
  });
});

describe('기간 검사', () => {
  it.each([
    ['형식 틀림', '?from=2026-11&to=2026-11-03'],
    ['없는 날짜', '?from=2026-02-30&to=2026-03-01'],
    ['from이 늦음', '?from=2026-11-05&to=2026-11-01'],
    ['367일', '?from=2025-01-01&to=2026-01-02'],
  ])('%s → 400', async (_name, qs) => {
    const res = await get(`/api/v1/admin/stats/summary${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STATS_INVALID_RANGE');
  });

  it('기간을 안 주면 오늘까지 30일', async () => {
    const res = await get('/api/v1/admin/stats/daily');
    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(30);
  });
});
