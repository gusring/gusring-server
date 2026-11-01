import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';
import { RATE_MAX } from '../src/routes/feedback.js';
import { useCleanDb } from './helpers.js';

const app = createApp();
useCleanDb();

describe('POST /feedback', () => {
  it('저장하고 201과 id를 돌려준다', async () => {
    const res = await request(app)
      .post('/feedback')
      .send({ lang: 'ja', formKey: 'birth-report', fieldId: 'childNameKo', type: 'guide', message: '  この欄の説明が分かりにくい  ' });
    expect(res.status).toBe(201);
    const row = await db().feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ lang: 'ja', formKey: 'birth-report', fieldId: 'childNameKo', type: 'guide', status: 'new' });
    expect(row.message).toBe('この欄の説明が分かりにくい'); // 앞뒤 공백 제거
  });

  it('원래 IP는 저장하지 않고 64자 해시만 남긴다', async () => {
    const res = await request(app).post('/feedback').send({ lang: 'ko', message: '좋아요' });
    const raw = await db().$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM feedback WHERE id = $1::uuid', res.body.id);
    const row = raw[0]!;
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    const all = JSON.stringify(row);
    expect(all).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
  });

  it('type을 안 보내면 general', async () => {
    const res = await request(app).post('/feedback').send({ lang: 'en', formNo: 4, message: 'ok' });
    const row = await db().feedback.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.type).toBe('general');
    expect(row.formNo).toBe(4);
  });

  it.each([
    ['lang 없음', { message: 'x' }, 'lang'],
    ['없는 언어', { lang: 'fr', message: 'x' }, 'lang'],
    ['빈 내용', { lang: 'ko', message: '   ' }, 'message'],
    ['2001자', { lang: 'ko', message: 'a'.repeat(2001) }, 'message'],
    ['formKey 형식', { lang: 'ko', message: 'x', formKey: 'Birth Report' }, 'formKey'],
    ['formNo 범위', { lang: 'ko', message: 'x', formNo: 0 }, 'formNo'],
    ['없는 유형', { lang: 'ko', message: 'x', type: 'spam' }, 'type'],
  ])('%s → 400 (어느 칸인지 알려줌)', async (_name, body, path) => {
    const res = await request(app).post('/feedback').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    expect(await db().feedback.count()).toBe(0);
  });

  it('2000자는 저장된다 (경계)', async () => {
    const res = await request(app).post('/feedback').send({ lang: 'ko', message: 'a'.repeat(2000) });
    expect(res.status).toBe(201);
  });

  it('숨은 칸(website)이 채워지면 201이지만 저장하지 않는다', async () => {
    const res = await request(app).post('/feedback').send({ lang: 'ko', message: '광고', website: 'http://spam' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeNull();
    expect(await db().feedback.count()).toBe(0);
  });

  it(`같은 IP는 10분에 ${RATE_MAX}건까지, 그다음은 429`, async () => {
    for (let i = 0; i < RATE_MAX; i++) {
      const ok = await request(app).post('/feedback').send({ lang: 'ko', message: `글 ${i}` });
      expect(ok.status).toBe(201);
    }
    const res = await request(app).post('/feedback').send({ lang: 'ko', message: '하나 더' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(await db().feedback.count()).toBe(RATE_MAX);
  });

  it('10분이 지난 글은 제한에 세지 않는다', async () => {
    await request(app).post('/feedback').send({ lang: 'ko', message: '첫 글' });
    const rows = await db().$queryRawUnsafe<{ ip_hash: string }[]>('SELECT ip_hash FROM feedback LIMIT 1');
    const ip_hash = rows[0]!.ip_hash;
    await db().feedback.createMany({
      data: Array.from({ length: RATE_MAX }, (_, i) => ({
        lang: 'ko' as const, message: `옛 글 ${i}`, ipHash: ip_hash, createdAt: new Date(Date.now() - 11 * 60 * 1000),
      })),
    });
    const res = await request(app).post('/feedback').send({ lang: 'ko', message: '새 글' });
    expect(res.status).toBe(201);
  });
});
