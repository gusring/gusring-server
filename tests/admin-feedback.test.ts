import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { ADMIN, useCleanDb } from './helpers.js';

const app = createApp();
useCleanDb();

const BASE = '/api/v1/admin/feedbacks';

async function seed() {
  const base = Date.parse('2026-10-01T00:00:00Z');
  await prisma().feedback.createMany({
    data: [
      { lang: 'ko', message: '첫째', createdAt: new Date(base), ipHash: 'a'.repeat(64) },
      { lang: 'ja', formKey: 'birth-report', type: 'guide', message: '둘째', createdAt: new Date(base + 1000), status: 'read' },
      { lang: 'ja', message: '셋째', createdAt: new Date(base + 2000) },
    ],
  });
}

const messages = (body: { data: { message: string }[] }) => body.data.map((x) => x.message);

describe('관리자 인증', () => {
  it('토큰이 없거나 틀리면 401 AUTH_ADMIN_REQUIRED', async () => {
    for (const auth of [undefined, 'Bearer wrong', 'test-admin-token']) {
      const req = request(app).get(BASE);
      const res = await (auth ? req.set('Authorization', auth) : req);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, error: { code: 'AUTH_ADMIN_REQUIRED' } });
    }
    expect((await request(app).get('/api/v1/admin/stats/summary')).status).toBe(401);
  });
});

describe(`GET ${BASE}`, () => {
  it('최신순으로 주고 ip_hash는 숨긴다', async () => {
    await seed();
    const res = await request(app).get(BASE).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, page: { offset: 0, limit: 20, total: 3 } });
    expect(messages(res.body)).toEqual(['셋째', '둘째', '첫째']);
    expect(JSON.stringify(res.body)).not.toContain('ipHash');
    expect(JSON.stringify(res.body)).not.toContain('aaaa');
  });

  it('상태·언어·서식으로 거른다', async () => {
    await seed();
    const byLang = await request(app).get(`${BASE}?lang=ja`).set(ADMIN);
    expect(byLang.body.page.total).toBe(2);
    const byStatus = await request(app).get(`${BASE}?status=read`).set(ADMIN);
    expect(messages(byStatus.body)).toEqual(['둘째']);
    const byForm = await request(app).get(`${BASE}?formKey=birth-report`).set(ADMIN);
    expect(byForm.body.page.total).toBe(1);
  });

  it('offset·limit으로 나눠 준다', async () => {
    await prisma().feedback.createMany({
      data: Array.from({ length: 23 }, (_, i) => ({ lang: 'ko' as const, message: `글 ${i}` })),
    });
    const p1 = await request(app).get(BASE).set(ADMIN);
    const p2 = await request(app).get(`${BASE}?offset=20`).set(ADMIN);
    const small = await request(app).get(`${BASE}?offset=5&limit=2`).set(ADMIN);
    expect(p1.body.data).toHaveLength(20);
    expect(p2.body.data).toHaveLength(3);
    expect(p2.body.page).toEqual({ offset: 20, limit: 20, total: 23 });
    expect(small.body.data).toHaveLength(2);
    expect(small.body.page).toEqual({ offset: 5, limit: 2, total: 23 });
  });

  it.each([
    ['없는 상태', '?status=done', 'status'],
    ['음수 offset', '?offset=-1', 'offset'],
    ['limit 0', '?limit=0', 'limit'],
    ['limit 101', '?limit=101', 'limit'],
  ])('%s → 400 COMMON_INVALID_INPUT', async (_name, qs, path) => {
    const res = await request(app).get(`${BASE}${qs}`).set(ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMON_INVALID_INPUT');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });
});

describe(`PATCH·DELETE ${BASE}/:feedbackId`, () => {
  it('상태를 바꾼다', async () => {
    await seed();
    const target = await prisma().feedback.findFirstOrThrow({ where: { message: '첫째' } });
    const res = await request(app).patch(`${BASE}/${target.id}`).set(ADMIN).send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { id: target.id, status: 'resolved' } });
    expect((await prisma().feedback.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('resolved');
  });

  it('잘못된 상태 값이나 다른 칸은 400', async () => {
    await seed();
    const target = await prisma().feedback.findFirstOrThrow();
    expect((await request(app).patch(`${BASE}/${target.id}`).set(ADMIN).send({ status: 'done' })).status).toBe(400);
    expect((await request(app).patch(`${BASE}/${target.id}`).set(ADMIN).send({ status: 'read', message: 'x' })).status).toBe(400);
  });

  it('형식이 틀린 id는 400, 없는 id는 404 FEEDBACK_NOT_FOUND', async () => {
    const missing = '33333333-3333-4333-8333-333333333333';
    const bad = await request(app).patch(`${BASE}/not-a-uuid`).set(ADMIN).send({ status: 'read' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toContain('feedbackId');
    for (const res of [
      await request(app).patch(`${BASE}/${missing}`).set(ADMIN).send({ status: 'read' }),
      await request(app).delete(`${BASE}/${missing}`).set(ADMIN),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FEEDBACK_NOT_FOUND');
    }
  });

  it('지우면 200(data null), 다시 지우면 404', async () => {
    await seed();
    const target = await prisma().feedback.findFirstOrThrow();
    const res = await request(app).delete(`${BASE}/${target.id}`).set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: '피드백을 삭제했습니다.', data: null });
    expect(await prisma().feedback.count()).toBe(2);
    expect((await request(app).delete(`${BASE}/${target.id}`).set(ADMIN)).status).toBe(404);
  });
});
