import type { CookieOptions, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { readCookie } from '../../utils/cookie.js';
import { sendSuccess } from '../../utils/response.js';
import { authService } from './auth.service.js';
import { SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_MAX_MS } from './auth.policy.js';
import type { LoginBody } from './auth.schema.js';

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

  me: ((_req, res) => {
    const admin = res.locals.admin as { username: string };
    sendSuccess(res, { message: '로그인 상태입니다.', data: { username: admin.username } });
  }) satisfies RequestHandler,
};
