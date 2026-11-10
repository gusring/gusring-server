/**
 * gusring-api.ts — 구스링 백엔드 연결 모듈 (gusring-web의 src/shared/ 에 복사해서 쓴다)
 *
 * 원본: gusring-server/examples/gusring-api.ts
 * 서버 테스트(tests/frontend-client.test.ts)가 이 파일로 실제 서버에 보내 확인한다. 고치면 원본도 같이 고친다.
 * 사용법: gusring-server/docs/frontend-integration.md
 *
 * - 이용 기록은 모아서 보낸다 (20개가 차거나 5초마다, 페이지를 떠날 때는 sendBeacon)
 * - 서버가 거부할 값(범위 밖 숫자, 필수 칸 없음)은 보내기 전에 고치거나 버린다.
 *   묶음에 하나라도 틀린 이벤트가 있으면 서버가 묶음 전체를 거부하기 때문
 * - 서식에 적는 값(이름·주민등록번호 등)은 넣을 칸이 없다
 * - 실패해도 화면에는 영향이 없다 (이용 기록은 조용히 버림)
 */

export type Lang = 'ko' | 'en' | 'zh' | 'ja' | 'vi';

export type EventType =
  | 'landing_view' | 'list_view' | 'form_view' | 'form_download' | 'language_select'
  | 'search' | 'category_filter' | 'feedback_click' | 'detail_time'
  | 'fill_start' | 'field_open' | 'fill_preview' | 'fill_png_save' | 'fill_print' | 'fill_reset';

export interface GusringEvent {
  type: EventType;
  lang?: Lang;
  /** 작성 도우미 서식 (예: birth-report) */
  formKey?: string;
  /** gusring-web 서식 번호 (forms.ts의 id) */
  formNo?: number;
  /** 작성 도우미 칸 (예: childNameKo) */
  fieldId?: string;
  category?: string;
  searchTerm?: string;
  resultCount?: number;
  durationSec?: number;
}

export type FeedbackType = 'general' | 'translation' | 'guide' | 'bug';

export interface FeedbackInput {
  lang: Lang;
  message: string;
  type?: FeedbackType;
  formKey?: string;
  formNo?: number;
  fieldId?: string;
  /** 봇을 거르는 숨은 입력칸 값. 화면에 보이지 않는 input의 값을 그대로 넘긴다 */
  website?: string;
}

export type FeedbackResult =
  | { ok: true; id: string | null }
  | { ok: false; code: string; message: string };

// ── 설정 ──

let baseUrl = 'https://api.gusring.kro.kr';
let flushMs = 5000;

/** 로컬 서버에 붙일 때: configureGusringApi({ baseUrl: 'http://localhost:4000' }) */
export function configureGusringApi(opts: { baseUrl?: string; flushMs?: number }): void {
  if (opts.baseUrl) baseUrl = opts.baseUrl.replace(/\/+$/, '');
  if (opts.flushMs !== undefined) flushMs = opts.flushMs;
}

// ── 방문자 id (브라우저에 저장한 무작위 값, 사람을 특정할 수 없음) ──

const VISITOR_KEY = 'gusring_visitor_id';
let memoryVisitorId: string | null = null;

function randomUuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); // 아주 오래된 브라우저: 통계용이라 이 정도면 된다
  b[6] = (b[6]! & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.prototype.map.call(b, (x: number) => (x + 0x100).toString(16).slice(1)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getVisitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = randomUuid();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    // 사생활 보호 모드 등으로 저장소를 못 쓰면 이 탭 안에서만 같은 값
    memoryVisitorId = memoryVisitorId ?? randomUuid();
    return memoryVisitorId;
  }
}

// ── 이용 기록 ──

const MAX_BATCH = 20;
const NEEDS_FORM: EventType[] = [
  'form_view', 'form_download', 'detail_time',
  'fill_start', 'field_open', 'fill_preview', 'fill_png_save', 'fill_print', 'fill_reset',
];
const FORM_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FIELD_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const clampInt = (v: number | undefined, min: number, max: number) =>
  v === undefined || !Number.isFinite(v) ? undefined : Math.min(max, Math.max(min, Math.round(v)));

/** 서버 규칙(docs/api.md)에 맞게 고친다. 고칠 수 없으면 null (보내지 않음) */
export function cleanEvent(e: GusringEvent): GusringEvent | null {
  const out: GusringEvent = { type: e.type };
  if (e.lang) out.lang = e.lang;
  if (e.formKey && FORM_KEY.test(e.formKey)) out.formKey = e.formKey;
  if (e.formNo !== undefined && Number.isInteger(e.formNo) && e.formNo >= 1 && e.formNo <= 999) out.formNo = e.formNo;
  if (e.fieldId && FIELD_ID.test(e.fieldId)) out.fieldId = e.fieldId;
  const category = e.category?.trim().slice(0, 32);
  if (category) out.category = category;
  const searchTerm = e.searchTerm?.trim().slice(0, 100);
  if (searchTerm) out.searchTerm = searchTerm;
  const resultCount = clampInt(e.resultCount, 0, 10000);
  if (resultCount !== undefined) out.resultCount = resultCount;
  const durationSec = clampInt(e.durationSec, 0, 3600);
  if (durationSec !== undefined) out.durationSec = durationSec;

  if (NEEDS_FORM.indexOf(out.type) >= 0 && out.formKey === undefined && out.formNo === undefined) return null;
  if (out.type === 'field_open' && !out.fieldId) return null;
  if (out.type === 'search' && !out.searchTerm) return null;
  if (out.type === 'detail_time' && out.durationSec === undefined) return null;
  return out;
}

let queue: GusringEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** 이용 기록 하나를 모아 둔다. GA4 호출 옆에 같이 부른다 */
export function track(e: GusringEvent): void {
  const ev = cleanEvent(e);
  if (!ev) return;
  queue.push(ev);
  if (queue.length >= MAX_BATCH) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), flushMs);
  }
}

/** 모아 둔 기록을 보낸다. useBeacon: 페이지를 떠날 때 (응답을 기다리지 않음) */
export async function flush(useBeacon = false): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const visitorId = getVisitorId();
  const sends: Promise<unknown>[] = [];
  while (queue.length > 0) {
    const events = queue.splice(0, MAX_BATCH);
    // text/plain은 CORS 사전 요청(preflight) 없이 바로 간다. 서버가 JSON으로 읽는다
    const body = JSON.stringify({ visitorId, events });
    const url = `${baseUrl}/api/v1/events`;
    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
    } else {
      // fetch가 없거나 바로 예외를 던져도 화면으로 번지지 않게 Promise 안에서 부른다
      sends.push(
        Promise.resolve()
          .then(() => fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }))
          .catch(() => undefined),
      );
    }
  }
  await Promise.all(sends);
}

/** 앱 시작 때 한 번 부른다. 탭을 숨기거나 떠날 때 남은 기록을 보낸다. 돌려받은 함수로 해제 */
export function startAutoFlush(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush(true);
  };
  const onPageHide = () => void flush(true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}

// ── 피드백 ──

/** 피드백을 보낸다. 실패하면 code로 이유를 알 수 있다 (FEEDBACK_RATE_LIMITED: 10분에 5건 초과) */
export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/feedbacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => null);
    if (json && json.success === true) return { ok: true, id: json.data.id };
    if (json && json.success === false) return { ok: false, code: json.error.code, message: json.message };
    return { ok: false, code: `HTTP_${res.status}`, message: '응답을 읽을 수 없습니다.' };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: '서버에 연결할 수 없습니다.' };
  }
}
