import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { adminUserService as users } from '../src/domains/auth/admin-user.service.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { ADMIN, useCleanDb } from './helpers.js';

// Origin 검사가 실제처럼 동작하게 서버를 한 주소로 띄워 둔다
let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
useCleanDb();

const PW = 'correct horse battery';
const login = (agent: request.Agent | ReturnType<typeof request>, username: string, password: string, origin: string | null = base) => {
  const req = (agent as request.Agent).post('/api/v1/auth/login');
  return (origin ? req.set('Origin', origin) : req).send({ username, password });
};
const newAgent = () => request.agent(base);

describe('비밀번호 해시', () => {
  it('scrypt 형식이고, 같은 비밀번호도 매번 다른 해시', async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword(`${PW}!`, a)).toBe(false);
    expect(await verifyPassword(PW, 'plain-text')).toBe(false);
  });
});

describe('로그인', () => {
  it('성공하면 HttpOnly·SameSite=Strict 쿠키, DB에는 쿠키 값이 아닌 해시만', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    const res = await login(agent, 'Eunhyeon ', PW); // 대소문자·공백은 정리해서 받는다
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { username: 'eunhyeon' } });
    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^gusring_admin=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1');
    expect(res.headers['cache-control']).toBe('no-store');

    const value = cookie.split(';')[0]!.split('=')[1]!;
    const sessions = await prisma().adminSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(sessions[0]!.id).not.toBe(value);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data).toEqual({ username: 'eunhyeon' });
    expect((await agent.get('/api/v1/admin/stats/summary')).status).toBe(200);
  });

  it('없는 아이디와 틀린 비밀번호는 같은 응답', async () => {
    await users.create('eunhyeon', PW);
    const wrongPw = await login(newAgent(), 'eunhyeon', 'nope-nope-nope');
    const noUser = await login(newAgent(), 'nobody', PW);
    for (const res of [wrongPw, noUser]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(wrongPw.body.message).toBe(noUser.body.message);
  });

  it('5번 틀리면 15분 잠금: 맞는 비밀번호도 429, 잠금이 풀리면 다시 되고 실패 수는 0으로', async () => {
    await users.create('eunhyeon', PW);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await login(newAgent(), 'eunhyeon', `wrong-${i}-password`)).body.error.code);
    expect(codes).toEqual([...Array(4).fill('AUTH_INVALID_CREDENTIALS'), 'AUTH_LOGIN_LOCKED']);
    const locked = await login(newAgent(), 'eunhyeon', PW);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('AUTH_LOGIN_LOCKED');

    const user = await prisma().adminUser.findUniqueOrThrow({ where: { username: 'eunhyeon' } });
    expect(user.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    await prisma().adminUser.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login(newAgent(), 'eunhyeon', PW)).status).toBe(200);
    expect((await prisma().adminUser.findUniqueOrThrow({ where: { id: user.id } })).failedCount).toBe(0);
  });

  it('동시에 10번 틀려도 실패를 빠짐없이 세고 잠근다', async () => {
    await users.create('eunhyeon', PW);
    await Promise.all(Array.from({ length: 10 }, (_, i) => login(newAgent(), 'eunhyeon', `wrong-${i}-password`)));
    const user = await prisma().adminUser.findUniqueOrThrow({ where: { username: 'eunhyeon' } });
    // 잠긴 뒤 도착한 요청은 비밀번호를 확인하지 않고 막으므로 5~10번. 확인한 실패는 모두 세야 한다
    const failedLogs = await prisma().adminAuditLog.count({ where: { action: 'login_failed' } });
    expect(user.lockedUntil).not.toBeNull();
    expect(user.failedCount).toBeGreaterThanOrEqual(5);
    expect(user.failedCount).toBe(failedLogs);
  });

  it('다른 사이트에서 보낸 로그인·Origin 없는 로그인은 403', async () => {
    await users.create('eunhyeon', PW);
    for (const origin of ['https://evil.example.com', null]) {
      const res = await login(newAgent(), 'eunhyeon', PW, origin);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_BAD_ORIGIN');
    }
  });

  it('막힌 계정은 로그인 불가, 막는 순간 기존 로그인도 끊김', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', PW);
    await users.disable('eunhyeon');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(newAgent(), 'eunhyeon', PW)).body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    await users.enable('eunhyeon');
    expect((await login(newAgent(), 'eunhyeon', PW)).status).toBe(200);
  });

  it('DB에서 직접 막아 세션이 남아 있어도 그 세션은 거부한다', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', PW);
    await prisma().adminUser.update({ where: { username: 'eunhyeon' }, data: { disabled: true } });
    expect(await prisma().adminSession.count()).toBe(1);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await prisma().adminSession.count()).toBe(0);
  });
});

describe('세션', () => {
  it('로그아웃하면 세션이 지워지고 쿠키도 지운다', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', PW);
    const out = await agent.post('/api/v1/auth/logout').set('Origin', base);
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie']![0]).toMatch(/gusring_admin=;.*Expires=Thu, 01 Jan 1970/);
    expect(await prisma().adminSession.count()).toBe(0);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('2시간 안 쓰거나 12시간이 지나면 다시 로그인', async () => {
    await users.create('eunhyeon', PW);
    const idle = newAgent();
    await login(idle, 'eunhyeon', PW);
    await prisma().adminSession.updateMany({ data: { lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000) } });
    expect((await idle.get('/api/v1/auth/me')).status).toBe(401);
    expect(await prisma().adminSession.count()).toBe(0);

    const old = newAgent();
    await login(old, 'eunhyeon', PW);
    await prisma().adminSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await old.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('조작한 쿠키는 401', async () => {
    const res = await request(base).get('/api/v1/auth/me').set('Cookie', 'gusring_admin=forged-value');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_ADMIN_REQUIRED');
  });

  it('쿠키로 바꾸는 요청(PATCH·DELETE)은 같은 출처에서만, 조회(GET)는 상관없음', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', PW);
    const fb = await prisma().feedback.create({ data: { lang: 'ko', message: '본문' } });
    const url = `/api/v1/admin/feedbacks/${fb.id}`;
    expect((await agent.patch(url).send({ status: 'read' })).body.error.code).toBe('AUTH_BAD_ORIGIN');
    expect((await agent.patch(url).set('Origin', 'https://gusring-guide.vercel.app').send({ status: 'read' })).status).toBe(403);
    expect((await agent.patch(url).set('Origin', base).send({ status: 'read' })).status).toBe(200);
    expect((await agent.get('/api/v1/admin/feedbacks')).status).toBe(200);
  });

  it('스크립트용 토큰은 그대로 쓸 수 있다 (Origin 검사 없음)', async () => {
    const fb = await prisma().feedback.create({ data: { lang: 'ko', message: '본문' } });
    expect((await request(base).patch(`/api/v1/admin/feedbacks/${fb.id}`).set(ADMIN).send({ status: 'read' })).status).toBe(200);
    expect((await request(base).get('/api/v1/auth/me').set(ADMIN)).body.data).toEqual({ username: 'token' });
  });
});

describe('관리 기록', () => {
  it('로그인·실패·피드백 상태 변경·삭제를 누가 했는지 남기고, 피드백 본문은 남기지 않는다', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', 'wrong-password-1');
    await login(agent, 'eunhyeon', PW);
    const fb = await prisma().feedback.create({ data: { lang: 'ja', type: 'bug', message: '電話番号 010-1234-5678' } });
    await agent.patch(`/api/v1/admin/feedbacks/${fb.id}`).set('Origin', base).send({ status: 'resolved' });
    await agent.delete(`/api/v1/admin/feedbacks/${fb.id}`).set('Origin', base);
    await request(base).get('/api/v1/admin/feedbacks').set(ADMIN);

    const res = await agent.get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(200);
    expect(res.body.data.map((x: { actor: string; action: string }) => `${x.actor} ${x.action}`)).toEqual([
      'eunhyeon feedback.delete',
      'eunhyeon feedback.status',
      'eunhyeon login',
      'eunhyeon login_failed',
      'cli user.create',
    ]);
    expect(res.body.data[0]).toMatchObject({ target: fb.id, detail: { lang: 'ja', type: 'bug' } });
    expect(res.body.data[1].detail).toEqual({ status: 'resolved' });
    expect(JSON.stringify(res.body)).not.toContain('010-1234');
    expect(res.body.page.total).toBe(5);

    const onlyLogin = await agent.get('/api/v1/admin/audit-logs?action=login');
    expect(onlyLogin.body.data).toHaveLength(1);
  });
});

describe('계정 관리 명령 (admin-user)', () => {
  it('아이디·비밀번호 규칙과 중복을 거른다', async () => {
    await expect(users.create('A', PW)).rejects.toThrow(/아이디/);
    await expect(users.create('1abc', PW)).rejects.toThrow(/아이디/);
    await expect(users.create('eunhyeon', 'short')).rejects.toThrow(/10자 이상/);
    await expect(users.create('eunhyeon', ` ${PW}`)).rejects.toThrow(/공백/);
    await users.create('eunhyeon', PW);
    await expect(users.create('eunhyeon', PW)).rejects.toThrow(/이미 있는/);
    await expect(users.setPassword('nobody', PW)).rejects.toThrow(/없는 계정/);
  });

  it('비밀번호를 바꾸면 로그인이 모두 끊기고 잠금도 풀린다', async () => {
    await users.create('eunhyeon', PW);
    const agent = newAgent();
    await login(agent, 'eunhyeon', PW);
    await prisma().adminUser.update({ where: { username: 'eunhyeon' }, data: { lockedUntil: new Date(Date.now() + 60_000), failedCount: 5 } });
    await users.setPassword('eunhyeon', 'another long password');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(newAgent(), 'eunhyeon', PW)).status).toBe(401);
    expect((await login(newAgent(), 'eunhyeon', 'another long password')).status).toBe(200);
  });

  it('목록에 상태와 로그인 수가 나오고, 원래 비밀번호·해시는 DB에서 사람이 읽을 수 없다', async () => {
    await users.create('eunhyeon', PW);
    await login(newAgent(), 'eunhyeon', PW);
    const [row] = await users.list();
    expect(row).toMatchObject({ username: 'eunhyeon', disabled: false, _count: { sessions: 1 } });
    const raw = await prisma().$queryRawUnsafe<{ password_hash: string }[]>('SELECT password_hash FROM admin_user');
    expect(raw[0]!.password_hash).not.toContain(PW);
  });
});
