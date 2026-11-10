import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { useCleanDb } from './helpers.js';

// examples/gusring-api.ts(프론트에 복사해 쓰는 모듈)를 브라우저 대신 Node에서 실제 서버에 붙여 본다.
// 브라우저 전용 타입(DOM)을 쓰는 파일이라 서버 tsc가 따라가지 않게 경로로 불러온다 (타입 검사는 examples/tsconfig.json).
type Client = {
  configureGusringApi(o: { baseUrl?: string; flushMs?: number }): void;
  getVisitorId(): string;
  track(e: Record<string, unknown>): void;
  flush(useBeacon?: boolean): Promise<void>;
  sendFeedback(i: Record<string, unknown>): Promise<{ ok: boolean; id?: string | null; code?: string }>;
};
const CLIENT_PATH = new URL('../examples/gusring-api.ts', import.meta.url).href;

useCleanDb();

let server: Server;
let client: Client;
const beacons: Promise<unknown>[] = [];

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  // sendBeacon 흉내: 브라우저처럼 text/plain 본문으로 실제 전송
  vi.stubGlobal('navigator', {
    sendBeacon: (url: string, data: Blob) => {
      beacons.push(data.text().then((body) => fetch(url, { method: 'POST', headers: { 'Content-Type': data.type }, body })));
      return true;
    },
  });
  client = (await import(CLIENT_PATH)) as Client;
  client.configureGusringApi({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, flushMs: 60_000 });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  beacons.length = 0;
});

const rows = () => prisma().usageEvent.findMany({ orderBy: { id: 'asc' } });

describe('examples/gusring-api.ts → 실제 서버', () => {
  it('방문자 id는 uuid이고 다시 불러도 같다', () => {
    const id = client.getVisitorId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(client.getVisitorId()).toBe(id);
  });

  it('GA4와 같은 지점의 이벤트들이 저장된다 (fetch)', async () => {
    client.track({ type: 'landing_view' });
    client.track({ type: 'language_select', lang: 'vi' });
    client.track({ type: 'list_view', lang: 'vi' });
    client.track({ type: 'search', lang: 'vi', searchTerm: '  khai sinh  ', resultCount: 0 });
    client.track({ type: 'category_filter', lang: 'vi', category: 'FAMILY' });
    client.track({ type: 'form_view', lang: 'vi', formNo: 4, category: 'FAMILY' });
    client.track({ type: 'form_download', lang: 'vi', formNo: 4 });
    client.track({ type: 'detail_time', lang: 'vi', formNo: 4, durationSec: 42.6 });
    client.track({ type: 'feedback_click', lang: 'vi' });
    await client.flush();
    const saved = await rows();
    expect(saved.map((r) => r.type)).toEqual([
      'landing_view', 'language_select', 'list_view', 'search', 'category_filter', 'form_view', 'form_download', 'detail_time', 'feedback_click',
    ]);
    expect(saved.every((r) => r.visitorId === client.getVisitorId())).toBe(true);
    expect(saved[3]).toMatchObject({ searchTerm: 'khai sinh', resultCount: 0 });
    expect(saved[7]).toMatchObject({ durationSec: 43 });
  });

  it('서버가 거부할 값은 고치거나 그 이벤트만 버려서, 묶음 전체가 거부되지 않는다', async () => {
    client.track({ type: 'detail_time', formNo: 6, durationSec: 99_999 }); // → 3600
    client.track({ type: 'form_view', formNo: 0 }); // 서식 번호가 범위 밖 → 서식 없음 → 버림
    client.track({ type: 'search', searchTerm: '   ' }); // 빈 검색어 → 버림
    client.track({ type: 'search', searchTerm: 'a'.repeat(150), resultCount: -3 }); // 100자로, 0으로
    client.track({ type: 'field_open', formKey: 'Birth Report', fieldId: 'x' }); // formKey 형식 틀림 → 버림
    client.track({ type: 'list_view', category: 'c'.repeat(40) }); // 32자로
    await client.flush();
    const saved = await rows();
    expect(saved.map((r) => r.type)).toEqual(['detail_time', 'search', 'list_view']);
    expect(saved[0]!.durationSec).toBe(3600);
    expect(saved[1]).toMatchObject({ resultCount: 0 });
    expect(saved[1]!.searchTerm).toHaveLength(100);
    expect(saved[2]!.category).toHaveLength(32);
  });

  it('20개가 차면 바로 보내고, 나머지는 flush 때 (25개 → 20 + 5)', async () => {
    for (let i = 0; i < 25; i++) client.track({ type: 'list_view', lang: 'ko' });
    await vi.waitFor(async () => expect(await prisma().usageEvent.count()).toBe(20));
    await client.flush();
    expect(await prisma().usageEvent.count()).toBe(25);
  });

  it('페이지를 떠날 때는 sendBeacon(text/plain)으로 보낸다', async () => {
    client.track({ type: 'fill_start', lang: 'zh', formKey: 'birth-report' });
    client.track({ type: 'field_open', lang: 'zh', formKey: 'birth-report', fieldId: 'childNameKo' });
    await client.flush(true);
    expect(beacons).toHaveLength(1);
    await Promise.all(beacons);
    expect((await rows()).map((r) => r.type)).toEqual(['fill_start', 'field_open']);
  });

  it('피드백: 저장되면 id, 틀리면 에러 코드, 도배면 FEEDBACK_RATE_LIMITED', async () => {
    const ok = await client.sendFeedback({ lang: 'ja', formNo: 6, type: 'guide', message: '説明が分かりにくい' });
    expect(ok.ok).toBe(true);
    expect(await prisma().feedback.findUnique({ where: { id: ok.id! } })).not.toBeNull();

    expect(await client.sendFeedback({ lang: 'ja', message: '   ' })).toMatchObject({ ok: false, code: 'COMMON_INVALID_INPUT' });

    for (let i = 0; i < 4; i++) await client.sendFeedback({ lang: 'ko', message: `글 ${i}` });
    expect(await client.sendFeedback({ lang: 'ko', message: '하나 더' })).toMatchObject({ ok: false, code: 'FEEDBACK_RATE_LIMITED' });
  });

  it('서버에 못 붙으면 이용 기록은 조용히 버리고, 피드백은 NETWORK_ERROR', async () => {
    client.configureGusringApi({ baseUrl: 'http://127.0.0.1:1' });
    client.track({ type: 'landing_view' });
    await expect(client.flush()).resolves.toBeUndefined();
    expect(await client.sendFeedback({ lang: 'ko', message: 'x' })).toMatchObject({ ok: false, code: 'NETWORK_ERROR' });
  });
});
