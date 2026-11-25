import { Router, type RequestHandler } from 'express';
import { z } from '../../config/zod.js';
import { errors, registry } from '../../config/openapi.js';
import { currentAdmin, requireManager } from '../../middlewares/admin-auth.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { success } from '../../utils/common-schema.js';
import { AppError, sendSuccess } from '../../utils/response.js';
import { adminUserService as users } from '../auth/admin-user.service.js';
import { adminUserItem, createUserBody, resetPasswordBody, updateUserBody, usernameParams, type CreateUserBody, type UpdateUserBody } from './users.schema.js';

// 관리자 계정 관리 (계정 관리자만). 규칙은 admin-user.service에 있다 (서버 명령과 같은 코드)

const target = (res: Parameters<RequestHandler>[1]) => (res.locals.params as { username: string }).username;

/** 자기 계정은 여기서 막거나 역할을 바꾸거나 초기화할 수 없다 (스스로 잠그는 실수 방지. 내 비밀번호는 '비밀번호 바꾸기'로) */
function notSelf(res: Parameters<RequestHandler>[1]) {
  if (target(res) === currentAdmin(res).username) throw new AppError('USER_SELF_CHANGE');
}

const c = {
  list: (async (_req, res) => {
    sendSuccess(res, { message: '관리자 계정 목록입니다.', data: await users.list() });
  }) satisfies RequestHandler,

  create: (async (_req, res) => {
    const { username, role, temporaryPassword } = res.locals.body as CreateUserBody;
    await users.create(username, temporaryPassword, { role, actor: currentAdmin(res).username, mustChange: true });
    sendSuccess(res, { status: 201, message: '계정을 만들었습니다. 처음 로그인 때 비밀번호를 바꾸게 됩니다.', data: { username } });
  }) satisfies RequestHandler,

  update: (async (_req, res) => {
    notSelf(res);
    const { role, disabled } = res.locals.body as UpdateUserBody;
    const actor = currentAdmin(res).username;
    if (role !== undefined) await users.setRole(target(res), role, actor);
    if (disabled !== undefined) await users.setDisabled(target(res), disabled, actor);
    sendSuccess(res, { message: '계정을 바꿨습니다.', data: null });
  }) satisfies RequestHandler,

  resetPassword: (async (_req, res) => {
    notSelf(res);
    const { temporaryPassword } = res.locals.body as { temporaryPassword: string };
    await users.setPassword(target(res), temporaryPassword, { actor: currentAdmin(res).username, mustChange: true });
    sendSuccess(res, { message: '임시 비밀번호로 바꾸고 그 계정의 로그인을 끊었습니다.', data: null });
  }) satisfies RequestHandler,

  unlock: (async (_req, res) => {
    await users.unlock(target(res), currentAdmin(res).username);
    sendSuccess(res, { message: '잠금을 풀었습니다.', data: null });
  }) satisfies RequestHandler,
};

// ── 관리자(계정 관리자): /api/v1/admin/users ──
export const adminUsersRouter = Router();
adminUsersRouter.use(requireManager);
adminUsersRouter.get('/', c.list);
adminUsersRouter.post('/', validateBody(createUserBody), c.create);
adminUsersRouter.patch('/:username', validateParams(usernameParams), validateBody(updateUserBody), c.update);
adminUsersRouter.post('/:username/password', validateParams(usernameParams), validateBody(resetPasswordBody), c.resetPassword);
adminUsersRouter.post('/:username/unlock', validateParams(usernameParams), c.unlock);

const common = { tags: ['Admin · Users'], security: [{ adminSession: [] }] };
const base = { 401: 'AUTH_ADMIN_REQUIRED', 403: 'AUTH_FORBIDDEN(계정 관리자 아님·토큰) · AUTH_PASSWORD_CHANGE_REQUIRED · AUTH_BAD_ORIGIN' };
const ok = (description: string, schema: z.ZodType = z.null()) => ({ description, content: { 'application/json': { schema: success(schema) } } });

registry.registerPath({
  method: 'get', path: '/api/v1/admin/users', ...common,
  summary: '관리자 계정 목록 (계정 관리자만)',
  responses: { 200: ok('목록', z.array(adminUserItem)), ...errors(base) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/users', ...common,
  summary: '관리자 계정 만들기 (임시 비밀번호)',
  description: '받은 사람은 처음 로그인 때 비밀번호를 바꾸기 전까지 다른 기능을 쓸 수 없다.',
  request: { body: { content: { 'application/json': { schema: createUserBody } } } },
  responses: { 201: ok('만듦', z.object({ username: z.string() })), ...errors({ 400: 'COMMON_INVALID_INPUT', 409: 'USER_ALREADY_EXISTS', ...base }) },
});
registry.registerPath({
  method: 'patch', path: '/api/v1/admin/users/{username}', ...common,
  summary: '역할 바꾸기·막기·풀기',
  description: '막으면 그 계정의 로그인이 바로 끊긴다. 계정 관리자가 한 명도 안 남게 되면 거부. 자기 계정은 불가.',
  request: { params: usernameParams, body: { content: { 'application/json': { schema: updateUserBody } } } },
  responses: { 200: ok('바뀜'), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'USER_NOT_FOUND', 409: 'USER_LAST_MANAGER · USER_SELF_CHANGE', ...base }) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/users/{username}/password', ...common,
  summary: '비밀번호 초기화 (임시 비밀번호)',
  description: '그 계정의 로그인을 모두 끊고 잠금도 푼다. 자기 계정은 불가(비밀번호 바꾸기 사용).',
  request: { params: usernameParams, body: { content: { 'application/json': { schema: resetPasswordBody } } } },
  responses: { 200: ok('초기화됨'), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'USER_NOT_FOUND', 409: 'USER_SELF_CHANGE', ...base }) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/users/{username}/unlock', ...common,
  summary: '5번 실패 잠금 풀기',
  request: { params: usernameParams },
  responses: { 200: ok('풀림'), ...errors({ 404: 'USER_NOT_FOUND', ...base }) },
});
