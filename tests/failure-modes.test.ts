import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// 설정 실수·장애 상황. 환경변수를 바꿔 앱을 새로 불러와야 해서 모듈을 매번 다시 읽는다.
async function freshApp(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import('../src/app.js');
  const { disconnectPrisma } = await import('../src/config/prisma.js');
  return { app: createApp(), disconnectPrisma };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('설정 실수', () => {
  it('ADMIN_TOKEN이 없으면 토큰으로는 못 들어온다 (빈 토큰도 거부)', async () => {
    const { app } = await freshApp({ ADMIN_TOKEN: '' });
    const res = await request(app).get('/api/v1/admin/feedbacks').set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_ADMIN_REQUIRED');
  });

  it('PORT가 숫자가 아니면 서버가 뜨지 않는다', async () => {
    vi.resetModules();
    vi.stubEnv('PORT', 'abc');
    await expect(import('../src/config/env.js')).rejects.toThrow(/PORT/);
  });
});

describe('DB 장애', () => {
  it('DB에 못 붙으면 500, 내부 정보(주소·스택)는 응답에 안 나간다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, disconnectPrisma } = await freshApp({ DATABASE_URL: 'postgresql://nobody:secret@localhost:5999/none' });
    const res = await request(app).post('/api/v1/feedbacks').send({ lang: 'ko', message: '테스트' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: '서버 오류가 발생했습니다.', error: { code: 'COMMON_INTERNAL_ERROR' } });
    expect(JSON.stringify(res.body)).not.toMatch(/5999|secret|nobody/);
    expect(spy).toHaveBeenCalled(); // 서버 로그에는 남긴다
    await disconnectPrisma();
    spy.mockRestore();
  });

  it('DB 장애 때 관리자 변경·삭제는 404(없음)로 속이지 않고 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, disconnectPrisma } = await freshApp({ DATABASE_URL: 'postgresql://nobody:secret@localhost:5999/none' });
    const id = '33333333-3333-4333-8333-333333333333';
    const auth = { Authorization: 'Bearer test-admin-token' };
    const patch = await request(app).patch(`/api/v1/admin/feedbacks/${id}`).set(auth).send({ status: 'read' });
    const del = await request(app).delete(`/api/v1/admin/feedbacks/${id}`).set(auth);
    expect([patch.status, del.status]).toEqual([500, 500]);
    expect(del.body.error.code).toBe('COMMON_INTERNAL_ERROR');
    await disconnectPrisma();
    spy.mockRestore();
  });

  it('DB가 없어도 /health는 응답한다', async () => {
    const { app } = await freshApp({ DATABASE_URL: 'postgresql://nobody:secret@localhost:5999/none' });
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('요청 크기·CORS', () => {
  it('100kb를 넘는 JSON은 413', async () => {
    const { app } = await freshApp({});
    const res = await request(app).post('/api/v1/feedbacks').send({ lang: 'ko', message: 'a'.repeat(120_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('COMMON_PAYLOAD_TOO_LARGE');
  });

  it('허용한 주소의 사전 요청(preflight)은 204와 허용 헤더', async () => {
    const { app } = await freshApp({});
    const res = await request(app)
      .options('/api/v1/feedbacks')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('관리자 API 사전 요청도 토큰 검사 전에 CORS가 처리한다 (허용 안 된 주소엔 헤더 없음)', async () => {
    const { app } = await freshApp({});
    const res = await request(app)
      .options('/api/v1/admin/feedbacks')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('운영 설정', () => {
  it('NODE_ENV=production이면 로그인 쿠키에 Secure (HTTPS로만 보냄)', async () => {
    const { app, disconnectPrisma } = await freshApp({ NODE_ENV: 'production' });
    const { prisma } = await import('../src/config/prisma.js');
    const { adminUserService } = await import('../src/domains/auth/admin-user.service.js');
    await prisma().$executeRawUnsafe('TRUNCATE admin_session, admin_user, admin_audit_log RESTART IDENTITY');
    await adminUserService.create('prodcheck', 'long enough password', { role: 'manager', actor: 'cli', mustChange: false });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const res = await request(base).post('/api/v1/auth/login').set('Origin', base).send({ username: 'prodcheck', password: 'long enough password' });
    await new Promise((r) => server.close(r));
    await prisma().$executeRawUnsafe('TRUNCATE admin_session, admin_user, admin_audit_log RESTART IDENTITY');
    await disconnectPrisma();
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]).toMatch(/; Secure/);
  });
});
