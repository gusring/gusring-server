import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/response.js';

// 1단계 관리자 인증: Authorization: Bearer <ADMIN_TOKEN>
// 길이가 달라도 비교 시간이 같도록 양쪽을 해시해서 비교한다.
const digest = (s: string) => createHash('sha256').update(s).digest();

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const expected = env.adminToken;
  if (!expected) throw new AppError('AUTH_ADMIN_DISABLED');
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    throw new AppError('AUTH_ADMIN_REQUIRED');
  }
  next();
};
