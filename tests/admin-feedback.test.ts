import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { PAGE_SIZE } from '../src/routes/admin-feedback.js';
import { ADMIN, useCleanDb } from './helpers.js';

const app = createApp();
useCleanDb();

async function seed() {
  const base = Date.parse('2026-10-01T00:00:00Z');
  await db().feedback.createMany({
    data: [
      { lang: 'ko', message: '첫째', createdAt: new Date(base), ipHash: 'a'.repeat(64) },
      { lang: 'ja', formKey: 'birth-report', type: 'guide', message: '둘째', createdAt: new Date(base + 1000), status: 'read' },
      { lang: 'ja', message: '셋째', createdAt: new Date(base + 2000) },
    ],
  });
}

describe('관리자 인증', () => {
  it('토큰이 없거나 틀리면 401', async () => {
    expect((await request(app).get('/admin/feedback')).status).toBe(401);
    expect((await request(app).get('/admin/feedback').set('Authorization', 'Bearer wrong')).status).toBe(401);
    expect((await request(app).get('/admin/feedback').set('Authorization', 'test-admin-token')).status).toBe(401);
    expect((await request(app).get('/admin/stats/summary')).status).toBe(401);
  });
});

describe('GET /admin/feedback', () => {
  it('최신순으로 주고 ip_hash는 숨긴다', async () => {
    await seed();
    const res = await request(app).get('/admin/feedback').set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((x: { message: string }) => x.message)).toEqual(['셋째', '둘째', '첫째']);
    expect(JSON.stringify(res.body)).not.toContain('ipHash');
    expect(JSON.stringify(res.body)).not.toContain('aaaa');
  });

  it('상태·언어·서식으로 거른다', async () => {
    await seed();
    const byLang = await request(app).get('/admin/feedback?lang=ja').set(ADMIN);
    expect(byLang.body.total).toBe(2);
    const byStatus = await request(app).get('/admin/feedback?status=read').set(ADMIN);
    expect(byStatus.body.items.map((x: { message: string }) => x.message)).toEqual(['둘째']);
    const byForm = await request(app).get('/admin/feedback?formKey=birth-report').set(ADMIN);
    expect(byForm.body.total).toBe(1);
  });

  it(`${PAGE_SIZE}개씩 나눠 준다`, async () => {
    await db().feedback.createMany({
      data: Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({ lang: 'ko' as const, message: `글 ${i}` })),
    });
    const p1 = await request(app).get('/admin/feedback?page=1').set(ADMIN);
    const p2 = await request(app).get('/admin/feedback?page=2').set(ADMIN);
    expect(p1.body.items).toHaveLength(PAGE_SIZE);
    expect(p2.body.items).toHaveLength(3);
    expect(p2.body.total).toBe(PAGE_SIZE + 3);
  });

  it('잘못된 필터는 400', async () => {
    expect((await request(app).get('/admin/feedback?status=done').set(ADMIN)).status).toBe(400);
    expect((await request(app).get('/admin/feedback?page=0').set(ADMIN)).status).toBe(400);
  });
});

describe('PATCH·DELETE /admin/feedback/:id', () => {
  it('상태를 바꾼다', async () => {
    await seed();
    const target = await db().feedback.findFirstOrThrow({ where: { message: '첫째' } });
    const res = await request(app).patch(`/admin/feedback/${target.id}`).set(ADMIN).send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect((await db().feedback.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('resolved');
  });

  it('잘못된 상태 값이나 다른 칸은 400', async () => {
    await seed();
    const target = await db().feedback.findFirstOrThrow();
    expect((await request(app).patch(`/admin/feedback/${target.id}`).set(ADMIN).send({ status: 'done' })).status).toBe(400);
    expect((await request(app).patch(`/admin/feedback/${target.id}`).set(ADMIN).send({ status: 'read', message: 'x' })).status).toBe(400);
  });

  it('없는 id·형식이 틀린 id는 404', async () => {
    const missing = '33333333-3333-4333-8333-333333333333';
    expect((await request(app).patch(`/admin/feedback/${missing}`).set(ADMIN).send({ status: 'read' })).status).toBe(404);
    expect((await request(app).patch('/admin/feedback/not-a-uuid').set(ADMIN).send({ status: 'read' })).status).toBe(404);
    expect((await request(app).delete(`/admin/feedback/${missing}`).set(ADMIN)).status).toBe(404);
  });

  it('지우면 204, 다시 지우면 404', async () => {
    await seed();
    const target = await db().feedback.findFirstOrThrow();
    expect((await request(app).delete(`/admin/feedback/${target.id}`).set(ADMIN)).status).toBe(204);
    expect(await db().feedback.count()).toBe(2);
    expect((await request(app).delete(`/admin/feedback/${target.id}`).set(ADMIN)).status).toBe(404);
  });
});
