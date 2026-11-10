import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../domains/auth/auth.policy.js';
import { authService, type AdminIdentity } from '../domains/auth/auth.service.js';
import { readCookie } from '../utils/cookie.js';
import { AppError } from '../utils/response.js';

// 관리자 인증: 로그인 쿠키(관리자 화면) 또는 Authorization: Bearer <ADMIN_TOKEN>(스크립트, 선택).
// 길이가 달라도 비교 시간이 같도록 토큰은 양쪽을 해시해서 비교한다.
const digest = (s: string) => createHash('sha256').update(s).digest();

function tokenMatches(req: Request): boolean {
  const expected = env.adminToken;
  if (!expected) return false;
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token.length > 0 && timingSafeEqual(digest(token), digest(expected));
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 쿠키는 브라우저가 알아서 붙이므로, 다른 사이트가 몰래 보내는 요청(CSRF)을 막으려고
 * 바꾸는 요청은 Origin이 이 서버와 같을 때만 받는다. (쿠키도 SameSite=Strict)
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  let host: string | null = null;
  try {
    host = origin ? new URL(origin).host : null;
  } catch {
    host = null;
  }
  if (!host || host !== req.get('host')) throw new AppError('AUTH_BAD_ORIGIN');
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  if (tokenMatches(req)) {
    // 스크립트용 토큰: 통계·피드백만 (계정 관리 불가)
    res.locals.admin = { username: 'token', via: 'token', role: 'staff', mustChangePassword: false } satisfies AdminIdentity;
    return next();
  }
  const cookie = readCookie(req, SESSION_COOKIE);
  const admin = cookie ? await authService.authenticate(cookie) : null;
  if (!admin) throw new AppError('AUTH_ADMIN_REQUIRED');
  res.locals.admin = admin;
  // 쿠키로 들어온 경우에만 출처 확인 (토큰은 브라우저가 자동으로 붙이지 않으므로 해당 없음)
  requireSameOrigin(req, res, next);
};

export const currentAdmin = (res: { locals: Record<string, unknown> }) => res.locals.admin as AdminIdentity;

/** 임시 비밀번호로 들어온 관리자는 비밀번호를 바꾸기 전까지 관리자 기능을 못 쓴다 (requireAdmin 다음에) */
export const requireFreshPassword: RequestHandler = (_req, res, next) => {
  if (currentAdmin(res).mustChangePassword) throw new AppError('AUTH_PASSWORD_CHANGE_REQUIRED');
  next();
};

/** 계정 관리자만 (requireAdmin 다음에). 토큰은 사람 계정이 아니라 안 된다 */
export const requireManager: RequestHandler = (_req, res, next) => {
  const admin = currentAdmin(res);
  if (admin.via !== 'session' || admin.role !== 'manager') throw new AppError('AUTH_FORBIDDEN');
  next();
};
