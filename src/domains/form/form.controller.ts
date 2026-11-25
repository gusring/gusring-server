import type { RequestHandler } from 'express';
import { currentAdmin } from '../../middlewares/admin-auth.js';
import { sendSuccess } from '../../utils/response.js';
import { formService } from './form.service.js';
import type { CreateFormBody, PublishBody, SaveDraftBody } from './form.schema.js';

type IdParams = { id: string };
const params = <T>(res: Parameters<RequestHandler>[1]) => res.locals.params as T;
const actor = (res: Parameters<RequestHandler>[1]) => currentAdmin(res).username;

/** 쪽 이미지는 내용이 바뀌면 id(SHA-256)도 바뀌므로 오래 캐시해도 된다 */
const IMAGE_CACHE = 'public, max-age=31536000, immutable';

export const formController = {
  // ── 공개 ──
  listPublished: (async (_req, res) => {
    sendSuccess(res, { message: '공개한 서식 목록입니다.', data: await formService.listPublished() });
  }) satisfies RequestHandler,

  getPublished: (async (_req, res) => {
    const { key } = params<{ key: string }>(res);
    sendSuccess(res, { message: '서식 정의입니다.', data: await formService.getPublished(key) });
  }) satisfies RequestHandler,

  /** 공통 응답 형식의 예외: PNG를 그대로 보낸다 */
  getImage: (async (_req, res) => {
    const bytes = await formService.getImage(params<IdParams>(res).id);
    res.set('Cache-Control', IMAGE_CACHE).type('png').send(bytes);
  }) satisfies RequestHandler,

  // ── 관리자 ──
  listAdmin: (async (_req, res) => {
    sendSuccess(res, { message: '서식 목록입니다.', data: await formService.listAdmin() });
  }) satisfies RequestHandler,

  create: (async (_req, res) => {
    const item = await formService.create(res.locals.body as CreateFormBody, actor(res));
    sendSuccess(res, { status: 201, message: '서식을 만들었습니다.', data: item });
  }) satisfies RequestHandler,

  get: (async (_req, res) => {
    sendSuccess(res, { message: '서식 초안입니다.', data: await formService.get(params<IdParams>(res).id) });
  }) satisfies RequestHandler,

  saveDraft: (async (_req, res) => {
    const item = await formService.saveDraft(params<IdParams>(res).id, res.locals.body as SaveDraftBody, actor(res));
    sendSuccess(res, { message: '초안을 저장했습니다.', data: item });
  }) satisfies RequestHandler,

  remove: (async (_req, res) => {
    await formService.remove(params<IdParams>(res).id, actor(res));
    sendSuccess(res, { message: '서식을 지웠습니다.', data: null });
  }) satisfies RequestHandler,

  publish: (async (_req, res) => {
    const data = await formService.publish(params<IdParams>(res).id, res.locals.body as PublishBody, actor(res));
    sendSuccess(res, { message: `${data.version}판을 공개했습니다.`, data });
  }) satisfies RequestHandler,

  versions: (async (_req, res) => {
    sendSuccess(res, { message: '공개한 판 목록입니다.', data: await formService.versions(params<IdParams>(res).id) });
  }) satisfies RequestHandler,

  restore: (async (_req, res) => {
    const { id, version } = params<{ id: string; version: number }>(res);
    const item = await formService.restore(id, version, actor(res));
    sendSuccess(res, { message: `${version}판을 초안으로 되돌렸습니다. 공개하려면 다시 공개해 주세요.`, data: item });
  }) satisfies RequestHandler,

  uploadImage: (async (req, res) => {
    const img = await formService.uploadImage(req.body, actor(res));
    sendSuccess(res, { status: 201, message: '이미지를 올렸습니다.', data: img });
  }) satisfies RequestHandler,
};
