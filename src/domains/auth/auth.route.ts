import { Router } from 'express';
import { z } from '../../config/zod.js';
import { adminSecurity, errors, registry } from '../../config/openapi.js';
import { noStore } from '../../middlewares/security-headers.js';
import { requireAdmin, requireSameOrigin } from '../../middlewares/admin-auth.js';
import { validateBody } from '../../middlewares/validate.js';
import { success } from '../../utils/common-schema.js';
import { authController as c } from './auth.controller.js';
import { loginBody, meData } from './auth.schema.js';

// ── /api/v1/auth ──
export const authRouter = Router();
authRouter.use(noStore);
authRouter.post('/login', requireSameOrigin, validateBody(loginBody), c.login);
authRouter.post('/logout', requireSameOrigin, c.logout);
authRouter.get('/me', requireAdmin, c.me);

const tags = ['Auth'];

registry.registerPath({
  method: 'post', path: '/api/v1/auth/login', tags,
  summary: '관리자 로그인',
  description:
    '성공하면 gusring_admin 쿠키(HttpOnly, SameSite=Strict, 운영은 Secure)를 준다. 2시간 쓰지 않거나 12시간이 지나면 다시 로그인. ' +
    '같은 계정 5번 연속 실패 시 15분 잠금. Nginx에서 IP당 분당 10번(순간 5) 제한. 다른 사이트에서 보낸 요청(Origin 불일치)은 거부.',
  request: { body: { content: { 'application/json': { schema: loginBody } } } },
  responses: {
    200: { description: '로그인됨', content: { 'application/json': { schema: success(meData) } } },
    ...errors({
      400: 'COMMON_INVALID_INPUT', 401: 'AUTH_INVALID_CREDENTIALS', 403: 'AUTH_BAD_ORIGIN',
      429: 'AUTH_LOGIN_LOCKED · COMMON_TOO_MANY_REQUESTS(Nginx)',
    }),
  },
});

registry.registerPath({
  method: 'post', path: '/api/v1/auth/logout', tags,
  summary: '로그아웃 (세션 삭제, 쿠키 지움)',
  responses: {
    200: { description: '로그아웃됨', content: { 'application/json': { schema: success(z.null()) } } },
    ...errors({ 403: 'AUTH_BAD_ORIGIN' }),
  },
});

registry.registerPath({
  method: 'get', path: '/api/v1/auth/me', tags, security: adminSecurity,
  summary: '지금 로그인한 관리자',
  responses: {
    200: { description: '로그인 상태', content: { 'application/json': { schema: success(meData) } } },
    ...errors({ 401: 'AUTH_ADMIN_REQUIRED' }),
  },
});
