import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { adminUserService as users } from '../src/domains/auth/admin-user.service.js';
import { ADMIN, useCleanDb } from './helpers.js';

// 관리자 화면의 계정 관리 (/api/v1/admin/users). Origin 검사 때문에 서버를 한 주소로 띄운다
let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
useCleanDb();

const PW = 'manager password 1';
const TEMP = 'temporary pass 22';
const MINE = 'my own password 333';
const MGR = { role: 'manager' as const, actor: 'cli', mustChange: false };

async function loginAs(username: string, password: string) {
  const agent = request.agent(base);
  const res = await agent.post('/api/v1/auth/login').set('Origin', base).send({ username, password });
  expect(res.status, `${username} 로그인`).toBe(200);
  return agent;
}
const send = (agent: request.Agent, method: 'post' | 'patch', path: string, body?: object) =>
  agent[method](`/api/v1/admin/users${path}`).set('Origin', base).send(body ?? {});

describe('계정 만들기 → 첫 로그인 때 비밀번호 바꾸기', () => {
  it('임시 비밀번호로는 비밀번호 바꾸기만 되고, 바꾸면 다른 기능이 열린다', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    const created = await send(boss, 'post', '', { username: 'GC-Officer', role: 'staff', temporaryPassword: TEMP });
    expect(created.status).toBe(201);
    expect(created.body.data).toEqual({ username: 'gc-officer' });

    const officer = await loginAs('gc-officer', TEMP);
    expect((await officer.get('/api/v1/auth/me')).body.data).toEqual({ username: 'gc-officer', role: 'staff', mustChangePassword: true });
    for (const path of ['/api/v1/admin/stats/summary', '/api/v1/admin/feedbacks', '/api/v1/admin/audit-logs']) {
      const res = await officer.get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    }
    const changed = await officer.post('/api/v1/auth/password').set('Origin', base).send({ currentPassword: TEMP, newPassword: MINE });
    expect(changed.status).toBe(200);
    expect((await officer.get('/api/v1/auth/me')).body.data.mustChangePassword).toBe(false);
    expect((await officer.get('/api/v1/admin/stats/summary')).status).toBe(200);
  });

  it('아이디·임시 비밀번호 규칙과 중복을 거른다', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    const bad = await send(boss, 'post', '', { username: '1bad', temporaryPassword: TEMP });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('username');
    const short = await send(boss, 'post', '', { username: 'okname', temporaryPassword: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error.details[0].path).toBe('password');
    await send(boss, 'post', '', { username: 'dup', temporaryPassword: TEMP });
    const dup = await send(boss, 'post', '', { username: 'dup', temporaryPassword: TEMP });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('USER_ALREADY_EXISTS');
    expect((await send(boss, 'post', '', { username: 'x1y', temporaryPassword: TEMP, admin: true })).status).toBe(400); // 정의 안 된 칸
  });

  it('목록에 역할·상태가 나오고 비밀번호 해시는 나오지 않는다. 기본 역할은 일반 관리자', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    await send(boss, 'post', '', { username: 'officer', temporaryPassword: TEMP });
    const list = await boss.get('/api/v1/admin/users');
    expect(list.status).toBe(200);
    expect(list.body.data.map((u: { username: string; role: string; mustChangePassword: boolean; sessions: number }) => [u.username, u.role, u.mustChangePassword, u.sessions]))
      .toEqual([['boss', 'manager', false, 1], ['officer', 'staff', true, 0]]);
    expect(JSON.stringify(list.body)).not.toMatch(/scrypt|passwordHash/);
  });
});

describe('권한', () => {
  it('일반 관리자·스크립트 토큰·로그인 안 함은 계정 관리를 못 한다', async () => {
    await users.create('boss', PW, MGR);
    await users.create('staffer', PW, { role: 'staff', actor: 'cli', mustChange: false });
    const staffer = await loginAs('staffer', PW);
    for (const res of [
      await staffer.get('/api/v1/admin/users'),
      await send(staffer, 'post', '', { username: 'sneaky', temporaryPassword: TEMP }),
      await send(staffer, 'patch', '/boss', { disabled: true }),
      await request(base).get('/api/v1/admin/users').set(ADMIN),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    }
    expect((await request(base).get('/api/v1/admin/users')).status).toBe(401);
    expect(await prisma().adminUser.count()).toBe(2);
    expect((await prisma().adminUser.findUniqueOrThrow({ where: { username: 'boss' } })).disabled).toBe(false);
  });

  it('다른 사이트에서 보낸 계정 변경은 403', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    const res = await boss.post('/api/v1/admin/users').set('Origin', 'https://evil.example.com').send({ username: 'evil', temporaryPassword: TEMP });
    expect(res.body.error.code).toBe('AUTH_BAD_ORIGIN');
    expect(await prisma().adminUser.count()).toBe(1);
  });
});

describe('막기·역할·초기화·잠금', () => {
  it('막으면 그 사람 로그인이 바로 끊기고 다시 못 들어온다. 풀면 들어온다', async () => {
    await users.create('boss', PW, MGR);
    await users.create('staffer', PW, { role: 'staff', actor: 'cli', mustChange: false });
    const boss = await loginAs('boss', PW);
    const staffer = await loginAs('staffer', PW);
    expect((await send(boss, 'patch', '/staffer', { disabled: true })).status).toBe(200);
    // 막는 순간 세션을 지운다 (로그인 확인 때 막힌 계정을 거르는 것과 별개로)
    expect(await prisma().adminSession.count({ where: { user: { username: 'staffer' } } })).toBe(0);
    expect((await staffer.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(base).post('/api/v1/auth/login').set('Origin', base).send({ username: 'staffer', password: PW })).status).toBe(401);
    await send(boss, 'patch', '/staffer', { disabled: false });
    await loginAs('staffer', PW);
  });

  it('역할을 계정 관리자로 바꾸면 계정 관리를 할 수 있다', async () => {
    await users.create('boss', PW, MGR);
    await users.create('staffer', PW, { role: 'staff', actor: 'cli', mustChange: false });
    const boss = await loginAs('boss', PW);
    const staffer = await loginAs('staffer', PW);
    expect((await staffer.get('/api/v1/admin/users')).status).toBe(403);
    await send(boss, 'patch', '/staffer', { role: 'manager' });
    expect((await staffer.get('/api/v1/admin/users')).status).toBe(200); // 세션은 그대로, 다음 요청부터 바로 반영
  });

  it('자기 계정은 막기·역할 바꾸기·초기화 불가 (409 USER_SELF_CHANGE)', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    for (const res of [
      await send(boss, 'patch', '/boss', { disabled: true }),
      await send(boss, 'patch', '/Boss', { role: 'staff' }),
      await send(boss, 'post', '/boss/password', { temporaryPassword: TEMP }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_SELF_CHANGE');
    }
  });

  it('두 계정 관리자가 동시에 서로를 일반 관리자로 바꿔도 한 명은 남는다', async () => {
    await users.create('alice', PW, MGR);
    await users.create('bob', PW, MGR);
    const alice = await loginAs('alice', PW);
    const bob = await loginAs('bob', PW);
    const [a, b] = await Promise.all([send(alice, 'patch', '/bob', { role: 'staff' }), send(bob, 'patch', '/alice', { role: 'staff' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body, b.body].find((x) => !x.success).error.code).toBe('USER_LAST_MANAGER');
    expect(await prisma().adminUser.count({ where: { role: 'manager' } })).toBe(1);
  });

  it('서버 명령으로도 마지막 계정 관리자는 막거나 일반으로 바꿀 수 없다', async () => {
    await users.create('boss', PW, MGR);
    await expect(users.setDisabled('boss', true, 'cli')).rejects.toMatchObject({ code: 'USER_LAST_MANAGER' });
    await expect(users.setRole('boss', 'staff', 'cli')).rejects.toMatchObject({ code: 'USER_LAST_MANAGER' });
  });

  it('비밀번호 초기화: 그 사람 로그인이 끊기고, 임시 비밀번호로 들어와 바꿔야 한다', async () => {
    await users.create('boss', PW, MGR);
    await users.create('staffer', MINE, { role: 'staff', actor: 'cli', mustChange: false });
    const boss = await loginAs('boss', PW);
    const staffer = await loginAs('staffer', MINE);
    expect((await send(boss, 'post', '/staffer/password', { temporaryPassword: TEMP })).status).toBe(200);
    expect((await staffer.get('/api/v1/auth/me')).status).toBe(401);
    const again = await loginAs('staffer', TEMP);
    expect((await again.get('/api/v1/auth/me')).body.data.mustChangePassword).toBe(true);
    expect((await send(boss, 'post', '/nobody/password', { temporaryPassword: TEMP })).body.error.code).toBe('USER_NOT_FOUND');
  });

  it('5번 실패로 잠긴 계정의 잠금을 푼다', async () => {
    await users.create('boss', PW, MGR);
    await users.create('staffer', PW, { role: 'staff', actor: 'cli', mustChange: false });
    for (let i = 0; i < 5; i++) await request(base).post('/api/v1/auth/login').set('Origin', base).send({ username: 'staffer', password: `wrong-${i}-xx` });
    expect((await request(base).post('/api/v1/auth/login').set('Origin', base).send({ username: 'staffer', password: PW })).body.error.code).toBe('AUTH_LOGIN_LOCKED');
    const boss = await loginAs('boss', PW);
    expect((await send(boss, 'post', '/staffer/unlock')).status).toBe(200);
    await loginAs('staffer', PW);
  });
});

describe('관리 기록', () => {
  it('누가 어떤 계정을 어떻게 바꿨는지 남고, 비밀번호는 남지 않는다', async () => {
    await users.create('boss', PW, MGR);
    const boss = await loginAs('boss', PW);
    await send(boss, 'post', '', { username: 'officer', role: 'staff', temporaryPassword: TEMP });
    await send(boss, 'patch', '/officer', { role: 'manager' });
    await send(boss, 'post', '/officer/password', { temporaryPassword: 'another temp 444' });
    await send(boss, 'patch', '/officer', { disabled: true });
    const logs = await prisma().adminAuditLog.findMany({ where: { action: { startsWith: 'user.' } }, orderBy: { id: 'asc' }, select: { actor: true, action: true, target: true, detail: true } });
    expect(logs).toEqual([
      { actor: 'cli', action: 'user.create', target: 'boss', detail: { role: 'manager' } },
      { actor: 'boss', action: 'user.create', target: 'officer', detail: { role: 'staff' } },
      { actor: 'boss', action: 'user.role', target: 'officer', detail: { from: 'staff', to: 'manager' } },
      { actor: 'boss', action: 'user.password', target: 'officer', detail: { by: 'admin', temporary: true } },
      { actor: 'boss', action: 'user.disable', target: 'officer', detail: null },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/temporary pass|another temp/);
  });
});
