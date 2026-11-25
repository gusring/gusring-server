import express, { Router } from 'express';
import { z } from '../../config/zod.js';
import { adminSecurity, errors, registry } from '../../config/openapi.js';
import { requireManager } from '../../middlewares/admin-auth.js';
import { validateBody, validateParams } from '../../middlewares/validate.js';
import { success } from '../../utils/common-schema.js';
import { formController as c } from './form.controller.js';
import {
  adminFormItem, adminFormListItem, createFormBody, formIdParams, formImageItem, formKeyParams, formVersionItem,
  imageIdParams, publicFormItem, publicFormListItem, publishBody, saveDraftBody, versionParams,
} from './form.schema.js';

/** 서식 정의는 100KB(전체 기본)를 넘을 수 있다. app.ts가 이 경로는 전체 JSON 읽기를 건너뛴다 */
export const ADMIN_FORM_JSON_LIMIT = '1mb';
export const FORM_IMAGE_LIMIT = '4mb';

const ok = (description: string, schema: z.ZodType) => ({ description, content: { 'application/json': { schema: success(schema) } } });

// ── 공개: /api/v1/forms, /api/v1/form-images ──
export const formRouter = Router();
formRouter.get('/', c.listPublished);
formRouter.get('/:key', validateParams(formKeyParams), c.getPublished);

export const formImageRouter = Router();
formImageRouter.get('/:id', validateParams(imageIdParams), c.getImage);

registry.registerPath({
  method: 'get', path: '/api/v1/forms', tags: ['Forms'],
  summary: '공개한 서식 목록 (번호순)',
  description: '공개한 판이 있고 지우지 않은 서식만. 제목·설명·분류는 공개한 판 기준.',
  responses: { 200: ok('목록', z.array(publicFormListItem)), ...errors({ 429: 'COMMON_TOO_MANY_REQUESTS(Nginx)' }) },
});
registry.registerPath({
  method: 'get', path: '/api/v1/forms/{key}', tags: ['Forms'],
  summary: '공개한 서식 정의',
  description: '`pages[].image`는 쪽 이미지 주소(`/api/v1/form-images/{id}`, 같은 서버 기준 절대 경로).',
  request: { params: formKeyParams },
  responses: {
    200: ok('서식 정의', publicFormItem),
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', 429: 'COMMON_TOO_MANY_REQUESTS(Nginx)' }),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/form-images/{id}', tags: ['Forms'],
  summary: '서식 쪽 이미지 (PNG)',
  description: '공통 응답 형식으로 감싸지 않는다. `Cache-Control: public, max-age=31536000, immutable`. CORS 허용 주소에는 `Access-Control-Allow-Origin`을 붙인다 (캔버스로 PNG 저장할 때 필요).',
  request: { params: imageIdParams },
  responses: {
    200: { description: 'PNG', content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_IMAGE_NOT_FOUND', 429: 'COMMON_TOO_MANY_REQUESTS(Nginx)' }),
  },
});

// ── 관리자: /api/v1/admin/forms ──
export const adminFormRouter = Router();
adminFormRouter.use(express.json({ limit: ADMIN_FORM_JSON_LIMIT }));
adminFormRouter.get('/', c.listAdmin);
adminFormRouter.post('/', validateBody(createFormBody), c.create);
adminFormRouter.get('/:id', validateParams(formIdParams), c.get);
adminFormRouter.patch('/:id', validateParams(formIdParams), validateBody(saveDraftBody), c.saveDraft);
adminFormRouter.delete('/:id', requireManager, validateParams(formIdParams), c.remove);
adminFormRouter.post('/:id/publish', requireManager, validateParams(formIdParams), validateBody(publishBody), c.publish);
adminFormRouter.get('/:id/versions', validateParams(formIdParams), c.versions);
adminFormRouter.post('/:id/versions/:version/restore', validateParams(versionParams), c.restore);

// ── 관리자: /api/v1/admin/form-images ──
export const adminFormImageRouter = Router();
adminFormImageRouter.post('/', express.raw({ type: 'image/png', limit: FORM_IMAGE_LIMIT }), c.uploadImage);

const tags = ['Admin · Forms'];
const auth = { 401: 'AUTH_ADMIN_REQUIRED', 403: 'AUTH_BAD_ORIGIN (쿠키로 POST·PATCH·DELETE) · AUTH_PASSWORD_CHANGE_REQUIRED' };
const managerAuth = { ...auth, 403: `AUTH_FORBIDDEN(계정 관리자 아님·토큰) · ${auth[403]}` };
const body = (schema: z.ZodType) => ({ body: { content: { 'application/json': { schema } } } });

registry.registerPath({
  method: 'get', path: '/api/v1/admin/forms', tags, security: adminSecurity,
  summary: '서식 목록 (지운 것 제외, 번호순)',
  responses: { 200: ok('목록', z.array(adminFormListItem)), ...errors(auth) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/forms', tags, security: adminSecurity,
  summary: '서식 만들기',
  description: '`definition`을 주면 그 초안으로, `copyFrom`(서식 id)을 주면 그 서식의 초안을 복사해서, 둘 다 없으면 빈 초안으로 만든다. 아직 공개되지 않는다. 지운 서식의 key·번호는 다시 쓸 수 없다.',
  request: body(createFormBody),
  responses: {
    201: ok('만든 서식', adminFormItem),
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND (copyFrom)', 409: 'FORM_KEY_TAKEN · FORM_NO_TAKEN', 413: 'COMMON_PAYLOAD_TOO_LARGE (1MB)', ...auth }),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/admin/forms/{id}', tags, security: adminSecurity,
  summary: '서식 초안과 정보',
  request: { params: formIdParams },
  responses: { 200: ok('서식', adminFormItem), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', ...auth }) },
});
registry.registerPath({
  method: 'patch', path: '/api/v1/admin/forms/{id}', tags, security: adminSecurity,
  summary: '초안 저장',
  description: '정의 전체를 바꾼다. 모양만 검사한다(번역이 비어도 저장됨, 내용 검사는 공개할 때). `baseUpdatedAt`이 지금 `draftUpdatedAt`과 다르면(그새 다른 사람이 저장) `FORM_CONFLICT`.',
  request: { params: formIdParams, ...body(saveDraftBody) },
  responses: {
    200: ok('저장한 서식', adminFormItem),
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', 409: 'FORM_CONFLICT · FORM_KEY_TAKEN · FORM_NO_TAKEN', 413: 'COMMON_PAYLOAD_TOO_LARGE (1MB)', ...auth }),
  },
});
registry.registerPath({
  method: 'delete', path: '/api/v1/admin/forms/{id}', tags, security: [{ adminSession: [] }],
  summary: '서식 지우기 (계정 관리자만)',
  description: '이용자에게서 바로 내리고 관리자 목록에서도 뺀다. 공개한 판은 DB에 남는다.',
  request: { params: formIdParams },
  responses: { 200: ok('지움', z.null()), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', ...managerAuth }) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/forms/{id}/publish', tags, security: [{ adminSession: [] }],
  summary: '초안 공개 (계정 관리자만)',
  description: '번역·좌표·이미지 크기 등 전체 검사 후 새 판으로 공개한다. 문제가 있으면 `FORM_INVALID`, `details`에 `{ path, message }` 목록(path는 정의 안 위치, 예: `fields[3].label.en`).',
  request: { params: formIdParams, ...body(publishBody) },
  responses: {
    200: ok('공개한 서식', adminFormItem),
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', 409: 'FORM_CONFLICT', 422: 'FORM_INVALID', ...managerAuth }),
  },
});
registry.registerPath({
  method: 'get', path: '/api/v1/admin/forms/{id}/versions', tags, security: adminSecurity,
  summary: '공개한 판 목록 (최신순)',
  request: { params: formIdParams },
  responses: { 200: ok('목록', z.array(formVersionItem)), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', ...auth }) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/forms/{id}/versions/{version}/restore', tags, security: adminSecurity,
  summary: '그 판을 초안으로 되돌리기',
  description: '초안만 바뀐다. 이용자에게 보이려면 다시 공개해야 한다.',
  request: { params: versionParams },
  responses: { 200: ok('되돌린 서식', adminFormItem), ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FORM_NOT_FOUND', 422: 'FORM_INVALID', ...auth }) },
});
registry.registerPath({
  method: 'post', path: '/api/v1/admin/form-images', tags, security: adminSecurity,
  summary: '서식 쪽 이미지 올리기 (PNG, 4MB까지)',
  description: '본문에 PNG 파일 그대로 (`Content-Type: image/png`). 크기는 PNG 머리에서 읽는다. id는 내용의 SHA-256이라 같은 파일은 같은 id.',
  request: { body: { content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) } } } },
  responses: {
    201: ok('올린 이미지', formImageItem),
    ...errors({ 400: 'FORM_IMAGE_INVALID', 413: 'COMMON_PAYLOAD_TOO_LARGE (4MB)', ...auth }),
  },
});
