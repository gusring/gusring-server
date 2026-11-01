import { HttpError } from '../middlewares/error-handler.js';

// 통계 기간: from·to는 한국 날짜(YYYY-MM-DD), to 포함. 기본 최근 30일. 최대 366일.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;

/** 시각 → 한국 날짜 (YYYY-MM-DD) */
export function kstDate(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국 날짜 → 그날 0시(한국)의 시각. 형식이 틀리거나 없는 날짜(2월 30일 등)면 400 */
function kstMidnight(value: unknown, name: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${name}은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const d = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime()) || kstDate(d.getTime()) !== value) {
    throw new HttpError(400, 'VALIDATION_ERROR', `없는 날짜입니다: ${value}`);
  }
  return d;
}

export interface DateRange {
  from: string;
  to: string;
  /** 포함 */
  start: Date;
  /** 미포함 (to 다음 날 0시) */
  end: Date;
}

export function parseRange(query: { from?: unknown; to?: unknown }, now = Date.now()): DateRange {
  const to = query.to === undefined ? kstDate(now) : (query.to as string);
  const toStart = kstMidnight(to, 'to');
  const from = query.from === undefined ? kstDate(toStart.getTime() - 29 * DAY_MS) : (query.from as string);
  const start = kstMidnight(from, 'from');
  const end = new Date(toStart.getTime() + DAY_MS);
  if (start >= end) throw new HttpError(400, 'VALIDATION_ERROR', 'from이 to보다 늦습니다.');
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new HttpError(400, 'VALIDATION_ERROR', `기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
  }
  return { from, to, start, end };
}
