import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { importForms } from '../src/cli/forms-import.js';
import { adminUserService as users } from '../src/domains/auth/admin-user.service.js';
import { ADMIN, useCleanDb } from './helpers.js';
import { L, makePng, randomPngLike, sha256, validDefinition } from './form-fixtures.js';

// Origin 검사가 실제처럼 동작하게 서버를 한 주소로 띄워 둔다 (auth.test.ts와 같은 방식)
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
let manager: request.Agent;
let staff: request.Agent;

async function loginAs(username: string, role: 'manager' | 'staff') {
  await users.create(username, PW, { role, actor: 'cli', mustChange: false });
  const agent = request.agent(base);
  const res = await agent.post('/api/v1/auth/login').set('Origin', base).send({ username, password: PW });
  expect(res.status).toBe(200);
  return agent;
}

beforeEach(async () => {
  manager = await loginAs('boss', 'manager');
  staff = await loginAs('worker', 'staff');
});

const png = makePng(200, 300);
const upload = (agent: request.Agent, body: Buffer = png, type = 'image/png') =>
  agent.post('/api/v1/admin/form-images').set('Origin', base).set('Content-Type', type).send(body);

/** 이미지 올리고 서식 만들기 → 만든 서식 */
async function createForm(key = 'birth-report', formNo = 4, agent = staff) {
  const img = await upload(agent);
  expect(img.status).toBe(201);
  const res = await agent.post('/api/v1/admin/forms').set('Origin', base).send({ key, formNo, definition: validDefinition(img.body.data.id) });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; draftUpdatedAt: string; draft: ReturnType<typeof validDefinition> };
}
const publish = (id: string, agent = manager) => agent.post(`/api/v1/admin/forms/${id}/publish`).set('Origin', base);
const save = (id: string, body: object, agent = staff) => agent.patch(`/api/v1/admin/forms/${id}`).set('Origin', base).send(body);

describe('쪽 이미지 올리기', () => {
  it('PNG 크기를 머리에서 읽고, id는 내용의 SHA-256 (같은 파일은 같은 id)', async () => {
    const res = await upload(staff);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: sha256(png), width: 200, height: 300 });
    expect((await upload(staff)).body.data.id).toBe(sha256(png));
    expect(await prisma().formImage.count()).toBe(1);
  });

  it('PNG가 아니거나 잘린 파일, 다른 Content-Type은 FORM_IMAGE_INVALID', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(100).fill(0)]);
    for (const [body, type] of [
      [jpeg, 'image/png'],
      [png.subarray(0, png.length - 5), 'image/png'],
      [png, 'application/octet-stream'],
    ] as const) {
      const res = await upload(staff, body, type);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FORM_IMAGE_INVALID');
    }
    expect(await prisma().formImage.count()).toBe(0);
  });

  it('4MB가 넘으면 413', async () => {
    const res = await upload(staff, randomPngLike(4 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('COMMON_PAYLOAD_TOO_LARGE');
  });

  it('쿠키로 올릴 때는 같은 출처에서만, 로그인 없으면 401', async () => {
    const noOrigin = await staff.post('/api/v1/admin/form-images').set('Content-Type', 'image/png').send(png);
    expect(noOrigin.body.error.code).toBe('AUTH_BAD_ORIGIN');
    expect((await request(base).post('/api/v1/admin/form-images').set('Content-Type', 'image/png').send(png)).status).toBe(401);
  });
});

describe('쪽 이미지 받기 (공개)', () => {
  it('PNG 그대로, 1년 캐시, 허용한 주소에만 CORS 헤더', async () => {
    const { id } = (await upload(staff)).body.data;
    const res = await request(base).get(`/api/v1/form-images/${id}`).set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(Buffer.compare(res.body as Buffer, png)).toBe(0);

    const evil = await request(base).get(`/api/v1/form-images/${id}`).set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('없는 이미지 404, id 형식이 틀리면 400', async () => {
    expect((await request(base).get(`/api/v1/form-images/${'0'.repeat(64)}`)).body.error.code).toBe('FORM_IMAGE_NOT_FOUND');
    expect((await request(base).get('/api/v1/form-images/../../etc')).status).toBe(404);
    expect((await request(base).get('/api/v1/form-images/abc')).body.error.code).toBe('COMMON_INVALID_INPUT');
  });
});

describe('서식 만들기·초안 저장', () => {
  it('만들면 초안만 (공개 안 됨), 관리자 목록에는 보인다', async () => {
    const form = await createForm();
    expect(Object.keys(form).sort()).toEqual(['draft', 'draftUpdatedAt', 'draftUpdatedBy', 'formNo', 'id', 'key', 'publishedVersion']);
    expect(form).toMatchObject({ key: 'birth-report', formNo: 4, draftUpdatedBy: 'worker', publishedVersion: null });
    const list = await staff.get('/api/v1/admin/forms');
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: form.id, key: 'birth-report', formNo: 4, title: L('출생신고서'), category: 'FAMILY', publishedVersion: null, publishedAt: null, hasUnpublishedChanges: true }),
    ]);
    expect((await request(base).get('/api/v1/forms')).body.data).toEqual([]);
    expect((await request(base).get('/api/v1/forms/birth-report')).body.error.code).toBe('FORM_NOT_FOUND');
  });

  it('정의 없이 만들면 빈 초안, copyFrom이면 그 서식 초안을 복사', async () => {
    const src = await createForm();
    const empty = await staff.post('/api/v1/admin/forms').set('Origin', base).send({ key: 'empty', formNo: 5 });
    expect(empty.status).toBe(201);
    expect(empty.body.data.draft).toMatchObject({ pages: [], fields: [], sections: [], category: 'CERT' });
    const copy = await staff.post('/api/v1/admin/forms').set('Origin', base).send({ key: 'copy', formNo: 6, copyFrom: src.id });
    expect(copy.body.data.draft).toEqual(src.draft);
    const both = await staff.post('/api/v1/admin/forms').set('Origin', base).send({ key: 'x', formNo: 7, copyFrom: src.id, definition: src.draft });
    expect(both.body.error.code).toBe('COMMON_INVALID_INPUT');
    const missing = await staff.post('/api/v1/admin/forms').set('Origin', base).send({ key: 'y', formNo: 8, copyFrom: '4649b09e-ccef-4a29-bd1e-4765fabae66b' });
    expect(missing.body.error.code).toBe('FORM_NOT_FOUND');
  });

  it('key·번호가 겹치면 FORM_KEY_TAKEN · FORM_NO_TAKEN (만들 때, 바꿀 때)', async () => {
    const a = await createForm('a-form', 1);
    const b = await createForm('b-form', 2);
    const send = (body: object) => staff.post('/api/v1/admin/forms').set('Origin', base).send(body);
    expect((await send({ key: 'a-form', formNo: 9 })).body.error.code).toBe('FORM_KEY_TAKEN');
    expect((await send({ key: 'c-form', formNo: 1 })).body.error.code).toBe('FORM_NO_TAKEN');
    const res = await save(b.id, { definition: b.draft, key: 'a-form', baseUpdatedAt: b.draftUpdatedAt });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FORM_KEY_TAKEN');
    expect((await save(b.id, { definition: b.draft, formNo: 1, baseUpdatedAt: b.draftUpdatedAt })).body.error.code).toBe('FORM_NO_TAKEN');
    // definition 없이 key·번호만 바꿀 수 있다
    const renamed = await save(a.id, { key: 'a-renamed', formNo: 3, baseUpdatedAt: a.draftUpdatedAt });
    expect(renamed.body.data).toMatchObject({ key: 'a-renamed', formNo: 3, draft: a.draft });
  });

  it('초안은 번역이 비어도 저장되지만, 모르는 칸·틀린 모양은 400', async () => {
    const form = await createForm();
    const draft = { ...form.draft, title: { ...form.draft.title, vi: '' } };
    const ok = await save(form.id, { definition: draft, baseUpdatedAt: form.draftUpdatedAt });
    expect(ok.status).toBe(200);
    expect(ok.body.data.draft.title.vi).toBe('');

    for (const bad of [
      { ...draft, extra: 1 },
      { ...draft, category: 'NOPE' },
      { ...draft, fields: [{ ...draft.fields[0], input: { kind: 'date' } }] },
      { ...draft, pages: [{ imageId: 'not-a-hash', width: 1, height: 1 }] },
    ]) {
      const res = await save(form.id, { definition: bad, baseUpdatedAt: ok.body.data.draftUpdatedAt });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('COMMON_INVALID_INPUT');
    }
  });

  it('다른 사람이 먼저 저장했으면 FORM_CONFLICT (덮어쓰지 않는다)', async () => {
    const form = await createForm();
    const first = await save(form.id, { definition: { ...form.draft, category: 'CERT' }, baseUpdatedAt: form.draftUpdatedAt }, manager);
    expect(first.status).toBe(200);
    expect(first.body.data.draftUpdatedBy).toBe('boss');
    const second = await save(form.id, { definition: { ...form.draft, category: 'VEHICLE' }, baseUpdatedAt: form.draftUpdatedAt });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('FORM_CONFLICT');
    expect(second.body.message).toContain('boss');
    expect(second.body.error.details).toEqual({ draftUpdatedAt: first.body.data.draftUpdatedAt, draftUpdatedBy: 'boss' });
    expect((await staff.get(`/api/v1/admin/forms/${form.id}`)).body.data.draft.category).toBe('CERT');
    // 같은 시각이라도 문자열이 다르면(받은 값을 그대로 보내지 않음) 충돌로 본다
    const sameInstant = first.body.data.draftUpdatedAt.replace('Z', '+00:00');
    expect((await save(form.id, { definition: form.draft, baseUpdatedAt: sameInstant })).body.error.code).toBe('FORM_CONFLICT');
    // 새 기준으로 다시 저장하면 된다
    expect((await save(form.id, { definition: form.draft, baseUpdatedAt: first.body.data.draftUpdatedAt })).status).toBe(200);
  });

  it('100KB가 넘는 정의도 저장된다 (1MB까지)', async () => {
    const form = await createForm();
    const long = 'あ'.repeat(1000);
    const fields = Array.from({ length: 40 }, (_, i) => ({ ...form.draft.fields[0]!, id: `f${i}`, help: { ko: long, en: long, zh: long, ja: long, vi: long } }));
    const big = { ...form.draft, fields };
    expect(JSON.stringify(big).length).toBeGreaterThan(200_000);
    const res = await save(form.id, { definition: big, baseUpdatedAt: form.draftUpdatedAt });
    expect(res.status).toBe(200);

    const huge = { ...big, fields: Array.from({ length: 120 }, (_, i) => ({ ...fields[0]!, id: `g${i}` })) };
    const tooBig = await save(form.id, { definition: huge, baseUpdatedAt: res.body.data.draftUpdatedAt });
    expect(tooBig.status).toBe(413);
    // 다른 공개 경로는 여전히 100KB
    const fb = await request(base).post('/api/v1/feedbacks').send({ lang: 'ko', message: 'x', website: 'x'.repeat(200_000) });
    expect(fb.status).toBe(413);
  });

  it('쿠키로 POST·PATCH·DELETE는 같은 출처에서만 (조회는 상관없음)', async () => {
    const form = await createForm();
    const body = { definition: form.draft, baseUpdatedAt: form.draftUpdatedAt };
    const reqs = [
      staff.post('/api/v1/admin/forms').send({ key: 'other', formNo: 9 }),
      staff.patch(`/api/v1/admin/forms/${form.id}`).send(body),
      staff.post(`/api/v1/admin/forms/${form.id}/versions/1/restore`),
      manager.delete(`/api/v1/admin/forms/${form.id}`),
      manager.post(`/api/v1/admin/forms/${form.id}/publish`).set('Origin', 'https://evil.example.com'),
    ];
    for (const res of await Promise.all(reqs)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_BAD_ORIGIN');
    }
    expect((await staff.get(`/api/v1/admin/forms/${form.id}`)).status).toBe(200);
  });

  it('로그인 없으면 401, 없는 서식은 404', async () => {
    expect((await request(base).get('/api/v1/admin/forms')).status).toBe(401);
    expect((await staff.get('/api/v1/admin/forms/4649b09e-ccef-4a29-bd1e-4765fabae66b')).body.error.code).toBe('FORM_NOT_FOUND');
  });
});

describe('공개·지우기 권한', () => {
  it('일반 관리자와 스크립트 토큰은 공개·지우기 불가 (AUTH_FORBIDDEN), 계정 관리자는 된다', async () => {
    const form = await createForm();
    for (const res of [
      await publish(form.id, staff),
      await staff.delete(`/api/v1/admin/forms/${form.id}`).set('Origin', base),
      await request(base).post(`/api/v1/admin/forms/${form.id}/publish`).set(ADMIN),
      await request(base).delete(`/api/v1/admin/forms/${form.id}`).set(ADMIN),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    }
    expect(await prisma().formVersion.count()).toBe(0);
    // 토큰은 일반 관리자: 만들기·저장은 된다
    const res = await request(base).post('/api/v1/admin/forms').set(ADMIN).send({ key: 'by-token', formNo: 50 });
    expect(res.status).toBe(201);
    expect(res.body.data.draftUpdatedBy).toBe('token');
    expect((await publish(form.id)).status).toBe(200);
  });
});

describe('공개', () => {
  it('공개하면 이용자 목록·정의에 나오고, 쪽 이미지는 받을 주소로 바뀐다', async () => {
    const form = await createForm();
    const res = await publish(form.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ version: 1 });
    expect((await staff.get('/api/v1/admin/forms')).body.data[0]).toMatchObject({ publishedVersion: 1, publishedAt: expect.any(String), hasUnpublishedChanges: false });

    const list = await request(base).get('/api/v1/forms');
    expect(list.body.data).toEqual([{ key: 'birth-report', formNo: 4, category: 'FAMILY', title: L('출생신고서'), desc: L('아이가 태어났을 때'), version: 1 }]);

    const detail = (await request(base).get('/api/v1/forms/birth-report')).body.data;
    expect(detail).toMatchObject({ key: 'birth-report', formNo: 4, version: 1 });
    // 저장한 정의 그대로 (이미지 주소는 화면이 imageId로 만든다)
    expect(detail.definition).toEqual(form.draft);
    expect(detail.definition.pages[0].imageId).toBe(sha256(png));
    expect((await request(base).get(`/api/v1/form-images/${detail.definition.pages[0].imageId}`)).status).toBe(200);
  });

  it('공개한 뒤 초안을 고쳐도 이용자에게는 공개한 판, 다시 공개하면 2판', async () => {
    const form = await createForm();
    await publish(form.id);
    const saved = await save(form.id, { definition: { ...form.draft, title: L('바뀐 제목') }, baseUpdatedAt: form.draftUpdatedAt });
    expect(saved.status).toBe(200);
    expect((await request(base).get('/api/v1/forms')).body.data[0].title).toEqual(L('출생신고서'));
    expect((await staff.get('/api/v1/admin/forms')).body.data[0].hasUnpublishedChanges).toBe(true);

    expect((await publish(form.id)).body.data).toEqual({ version: 2 });
    expect((await request(base).get('/api/v1/forms/birth-report')).body.data.definition.title).toEqual(L('바뀐 제목'));
  });

  it('검사에 걸리면 FORM_INVALID 422 + 문제 목록, 판을 만들지 않는다', async () => {
    const form = await createForm();
    const def = form.draft;
    const broken = {
      ...def,
      title: { ...def.title, en: ' ' },
      pages: [{ ...def.pages[0]!, width: 201 }],
      fields: [
        { ...def.fields[0]!, section: 'nowhere', area: { x: 150, y: 10, w: 100, h: 20 } },
        { ...def.fields[0]! },
        { ...def.fields[2]!, id: '1bad' },
      ],
    };
    await save(form.id, { definition: broken, baseUpdatedAt: form.draftUpdatedAt });
    const res = await publish(form.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FORM_INVALID');
    expect(res.body.error.details).toEqual(expect.arrayContaining([
      { message: '제목 en 비어 있음' },
      { message: '1쪽 크기 201×300 ↔ 실제 이미지 200×300' },
      { fieldId: 'child', message: '없는 섹션 nowhere' },
      { fieldId: 'child', message: '칸 id 중복' },
      { fieldId: '1bad', message: '칸 id는 영문자로 시작하는 영문·숫자·_·- 64자 이내' },
    ]));
    expect(await prisma().formVersion.count()).toBe(0);
  });

  it('올리지 않은 이미지를 가리키면 공개 불가', async () => {
    const form = await createForm();
    await save(form.id, { definition: { ...form.draft, pages: [{ imageId: 'a'.repeat(64), width: 200, height: 300 }] }, baseUpdatedAt: form.draftUpdatedAt });
    const res = await publish(form.id);
    expect(res.body.error.details).toEqual([{ message: expect.stringContaining('1쪽 이미지가 서버에 없음') }]);
  });

  it('baseUpdatedAt을 주면 그 뒤 바뀐 초안은 공개하지 않는다', async () => {
    const form = await createForm();
    await save(form.id, { definition: form.draft, baseUpdatedAt: form.draftUpdatedAt });
    const res = await manager.post(`/api/v1/admin/forms/${form.id}/publish`).set('Origin', base).send({ baseUpdatedAt: form.draftUpdatedAt });
    expect(res.body.error.code).toBe('FORM_CONFLICT');
  });
});

describe('판 목록·되돌리기', () => {
  it('되돌리면 그 판이 초안으로 (공개한 판은 그대로), 다시 공개하면 새 판', async () => {
    const form = await createForm();
    await publish(form.id);
    const v2 = { ...form.draft, title: L('2판') };
    await save(form.id, { definition: v2, baseUpdatedAt: form.draftUpdatedAt });
    await publish(form.id);

    const versions = await staff.get(`/api/v1/admin/forms/${form.id}/versions`);
    expect(versions.body.data).toEqual([
      { version: 2, publishedBy: 'boss', publishedAt: expect.any(String) },
      { version: 1, publishedBy: 'boss', publishedAt: expect.any(String) },
    ]);

    const res = await staff.post(`/api/v1/admin/forms/${form.id}/versions/1/restore`).set('Origin', base);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ publishedVersion: 2, draftUpdatedBy: 'worker' });
    expect(res.body.data.draft).toEqual(form.draft);
    expect((await staff.get('/api/v1/admin/forms')).body.data[0].hasUnpublishedChanges).toBe(true);
    expect((await request(base).get('/api/v1/forms/birth-report')).body.data.version).toBe(2);
    expect((await publish(form.id)).body.data).toEqual({ version: 3 });

    const missing = await staff.post(`/api/v1/admin/forms/${form.id}/versions/9/restore`).set('Origin', base);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('FORM_VERSION_NOT_FOUND');
  });
});

describe('지우기', () => {
  it('이용자·관리자 목록에서 빠지고 판은 남는다. key는 다시 못 쓴다', async () => {
    const form = await createForm();
    await publish(form.id);
    const res = await manager.delete(`/api/v1/admin/forms/${form.id}`).set('Origin', base);
    expect(res.status).toBe(200);
    expect((await request(base).get('/api/v1/forms')).body.data).toEqual([]);
    expect((await request(base).get('/api/v1/forms/birth-report')).status).toBe(404);
    expect((await staff.get('/api/v1/admin/forms')).body.data).toEqual([]);
    expect((await staff.get(`/api/v1/admin/forms/${form.id}`)).status).toBe(404);
    expect((await manager.delete(`/api/v1/admin/forms/${form.id}`).set('Origin', base)).status).toBe(404);
    expect(await prisma().formVersion.count()).toBe(1);
    const again = await staff.post('/api/v1/admin/forms').set('Origin', base).send({ key: 'birth-report', formNo: 99 });
    expect(again.body.error.code).toBe('FORM_KEY_TAKEN');
  });
});

describe('관리 기록', () => {
  it('만들기·저장·공개·되돌리기·지우기·이미지 올리기를 남긴다', async () => {
    const form = await createForm();
    await save(form.id, { definition: form.draft, baseUpdatedAt: form.draftUpdatedAt });
    await publish(form.id);
    await staff.post(`/api/v1/admin/forms/${form.id}/versions/1/restore`).set('Origin', base);
    await manager.delete(`/api/v1/admin/forms/${form.id}`).set('Origin', base);
    const logs = await prisma().adminAuditLog.findMany({ where: { action: { startsWith: 'form' } }, orderBy: { id: 'asc' } });
    expect(logs.map((l) => [l.actor, l.action])).toEqual([
      ['worker', 'form_image.upload'], ['worker', 'form.create'], ['worker', 'form.update'],
      ['boss', 'form.publish'], ['worker', 'form.restore'], ['boss', 'form.delete'],
    ]);
    expect(logs[3]!.detail).toEqual({ key: 'birth-report', version: 1 });
  });
});

describe('한꺼번에 넣기 (forms:import)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gusring-forms-'));
  });
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('이미지·서식을 넣고 1판 공개, 다시 돌리면 건너뛴다. 검사에 걸리면 초안만', async () => {
    const page = { imageId: 'p1.png', width: 200, height: 300 };
    const { pages: _p, ...def } = validDefinition('x'.repeat(64));
    await writeFile(join(dir, 'p1.png'), png);
    await writeFile(join(dir, 'forms.json'), JSON.stringify([
      { key: 'birth-report', formNo: 4, definition: { ...def, pages: [page] } },
      { key: 'broken', formNo: 5, definition: { ...def, title: { ...def.title, ja: '' }, pages: [page] } },
      { key: 'escape', formNo: 6, definition: { ...def, pages: [{ ...page, imageId: '../p1.png' }] } },
    ]));
    const lines: string[] = [];
    const first = await importForms(dir, (l) => lines.push(l));
    expect(first).toEqual({ created: ['birth-report'], skipped: [], failed: ['broken', 'escape'] });
    expect(lines.join('\n')).toContain('제목 ja 비어 있음');

    const pub = (await request(base).get('/api/v1/forms/birth-report')).body.data;
    expect(pub.definition.pages[0].imageId).toBe(sha256(png));
    const v = await prisma().formVersion.findFirstOrThrow();
    expect(v.publishedBy).toBe('import');
    expect(await prisma().formImage.count()).toBe(1);
    expect(await prisma().form.count()).toBe(2); // broken은 초안만, escape는 만들지 않음

    const second = await importForms(dir, () => {});
    expect(second).toEqual({ created: [], skipped: ['birth-report', 'broken'], failed: ['escape'] });
    expect(await prisma().formVersion.count()).toBe(1);
  });
});
