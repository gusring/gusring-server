import type { CookieOptions, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { readCookie } from '../../utils/cookie.js';
import { sendSuccess } from '../../utils/response.js';
import { authService, type AdminIdentity } from './auth.service.js';
import { SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_MAX_MS } from './auth.policy.js';
import type { ChangePasswordBody, LoginBody } from './auth.schema.js';
import { AppError } from '../../utils/response.js';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true, // 화면 스크립트가 읽을 수 없게
  secure: env.nodeEnv === 'production', // 운영은 HTTPS로만
  sameSite: 'strict',
  path: SESSION_COOKIE_PATH,
});

export const authController = {
  login: (async (_req, res) => {
    const { username, password } = res.locals.body as LoginBody;
    const session = await authService.login(username, password);
    res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(), maxAge: SESSION_MAX_MS });
    sendSuccess(res, { message: '로그인했습니다.', data: { username: session.username } });
  }) satisfies RequestHandler,

  logout: (async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    const admin = token ? await authService.authenticate(token) : null;
    await authService.logout(token, admin?.username);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    sendSuccess(res, { message: '로그아웃했습니다.', data: null });
  }) satisfies RequestHandler,

  changePassword: (async (req, res) => {
    const admin = res.locals.admin as { username: string; via: 'session' | 'token' };
    // 스크립트용 토큰은 사람 계정이 아니다
    if (admin.via !== 'session') throw new AppError('COMMON_BAD_REQUEST', '로그인한 관리자만 비밀번호를 바꿀 수 있습니다.');
    const { currentPassword, newPassword } = res.locals.body as ChangePasswordBody;
    await authService.changePassword(admin.username, readCookie(req, SESSION_COOKIE)!, currentPassword, newPassword);
    sendSuccess(res, { message: '비밀번호를 바꿨습니다. 다른 곳의 로그인은 끊었습니다.', data: null });
  }) satisfies RequestHandler,

  me: ((_req, res) => {
    const { username, role, mustChangePassword } = res.locals.admin as AdminIdentity;
    sendSuccess(res, { message: '로그인 상태입니다.', data: { username, role, mustChangePassword } });
  }) satisfies RequestHandler,
};
