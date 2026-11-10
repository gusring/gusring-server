import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { MAX_EVENTS } from '../src/domains/event/event.schema.js';
import { useCleanDb, VISITOR } from './helpers.js';

const app = createApp();
useCleanDb();

describe('POST /api/v1/events', () => {
  it('여러 이벤트를 한 번에 저장한다', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .send({
        visitorId: VISITOR,
        events: [
          { type: 'language_select', lang: 'vi' },
          { type: 'form_view', lang: 'vi', formNo: 4, category: 'FAMILY' },
          { type: 'search', lang: 'vi', searchTerm: 'khai sinh', resultCount: 0 },
          { type: 'field_open', lang: 'vi', formKey: 'birth-report', fieldId: 'childNameKo' },
        ],
      });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, message: '이용 기록을 받았습니다.', data: { accepted: 4 } });
    const rows = await prisma().usageEvent.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((r) => r.type)).toEqual(['language_select', 'form_view', 'search', 'field_open']);
    expect(rows.every((r) => r.visitorId === VISITOR)).toBe(true);
    expect(rows[2]).toMatchObject({ searchTerm: 'khai sinh', resultCount: 0 });
  });

  it('sendBeacon처럼 text/plain으로 온 JSON도 받는다', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ visitorId: VISITOR, events: [{ type: 'detail_time', formNo: 6, durationSec: 42 }] }));
    expect(res.status).toBe(202);
    expect(await prisma().usageEvent.count()).toBe(1);
  });

  it('text/plain인데 JSON이 깨졌으면 400', async () => {
    const res = await request(app).post('/api/v1/events').set('Content-Type', 'text/plain').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMON_BAD_REQUEST');
  });

  it.each([
    ['form_view에 서식 없음', { type: 'form_view' }, 'formKey'],
    ['fill_print에 서식 없음', { type: 'fill_print' }, 'formKey'],
    ['field_open에 칸 없음', { type: 'field_open', formKey: 'birth-report' }, 'fieldId'],
    ['search에 검색어 없음', { type: 'search' }, 'searchTerm'],
    ['detail_time에 시간 없음', { type: 'detail_time', formNo: 1 }, 'durationSec'],
    ['체류 시간 3601초', { type: 'detail_time', formNo: 1, durationSec: 3601 }, 'durationSec'],
    ['없는 이벤트', { type: 'click' }, 'type'],
  ])('%s → 400', async (_name, event, path) => {
    const res = await request(app).post('/api/v1/events').send({ visitorId: VISITOR, events: [event] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).join(' ')).toContain(path);
    expect(await prisma().usageEvent.count()).toBe(0);
  });

  it('정의 안 된 칸(입력값 등)이 섞이면 통째로 거부한다', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .send({ visitorId: VISITOR, events: [{ type: 'fill_preview', formKey: 'birth-report', value: '900101-1234567' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMON_INVALID_INPUT');
    expect(JSON.stringify(res.body)).not.toContain('900101'); // 거부 응답에 값을 되돌려 주지 않는다
    expect(await prisma().usageEvent.count()).toBe(0);
  });

  it(`${MAX_EVENTS}개는 되고 ${MAX_EVENTS + 1}개는 400`, async () => {
    const ev = { type: 'list_view', lang: 'ko' };
    const ok = await request(app).post('/api/v1/events').send({ visitorId: VISITOR, events: Array(MAX_EVENTS).fill(ev) });
    expect(ok.status).toBe(202);
    const tooMany = await request(app).post('/api/v1/events').send({ visitorId: VISITOR, events: Array(MAX_EVENTS + 1).fill(ev) });
    expect(tooMany.status).toBe(400);
  });

  it('visitorId가 uuid가 아니면 400, 빈 묶음도 400', async () => {
    expect((await request(app).post('/api/v1/events').send({ visitorId: 'abc', events: [{ type: 'list_view' }] })).status).toBe(400);
    expect((await request(app).post('/api/v1/events').send({ visitorId: VISITOR, events: [] })).status).toBe(400);
  });
});
