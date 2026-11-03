import { Router } from 'express';
import { z } from '../../config/zod.js';
import { adminAuth, errors, registry } from '../../config/openapi.js';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import { pageSchema, success } from '../../utils/common-schema.js';
import { feedbackController as c } from './feedback.controller.js';
import {
  createFeedbackBody, feedbackIdData, feedbackIdParams, feedbackItem, listFeedbackQuery, updateFeedbackBody,
} from './feedback.schema.js';

// ── 공개: /api/v1/feedbacks ──
export const feedbackRouter = Router();
feedbackRouter.post('/', validateBody(createFeedbackBody), c.create);

registry.registerPath({
  method: 'post', path: '/api/v1/feedbacks', tags: ['Feedback'],
  summary: '피드백 저장',
  description: '같은 사람(IP 해시) 10분 5건까지. 원래 IP는 저장하지 않는다. Nginx에서도 IP당 분당 10건(순간 5)으로 제한.',
  request: { body: { content: { 'application/json': { schema: createFeedbackBody } } } },
  responses: {
    201: { description: '저장됨', content: { 'application/json': { schema: success(feedbackIdData) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT · COMMON_BAD_REQUEST', 413: 'COMMON_PAYLOAD_TOO_LARGE', 429: 'FEEDBACK_RATE_LIMITED · COMMON_TOO_MANY_REQUESTS(Nginx)' }),
  },
});

// ── 관리자: /api/v1/admin/feedbacks ──
export const adminFeedbackRouter = Router();
adminFeedbackRouter.get('/', validateQuery(listFeedbackQuery), c.list);
adminFeedbackRouter.patch('/:feedbackId', validateParams(feedbackIdParams), validateBody(updateFeedbackBody), c.updateStatus);
adminFeedbackRouter.delete('/:feedbackId', validateParams(feedbackIdParams), c.remove);

const adminErrors = errors({ 401: 'AUTH_ADMIN_REQUIRED', 503: 'AUTH_ADMIN_DISABLED' });

registry.registerPath({
  method: 'get', path: '/api/v1/admin/feedbacks', tags: ['Admin · Feedback'], security: [{ [adminAuth.name]: [] }],
  summary: '피드백 목록 (최신순)',
  request: { query: listFeedbackQuery },
  responses: {
    200: { description: '목록', content: { 'application/json': { schema: success(z.array(feedbackItem)).extend({ page: pageSchema }) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT' }), ...adminErrors,
  },
});

registry.registerPath({
  method: 'patch', path: '/api/v1/admin/feedbacks/{feedbackId}', tags: ['Admin · Feedback'], security: [{ [adminAuth.name]: [] }],
  summary: '처리 상태 변경',
  request: { params: feedbackIdParams, body: { content: { 'application/json': { schema: updateFeedbackBody } } } },
  responses: {
    200: { description: '바뀐 피드백', content: { 'application/json': { schema: success(feedbackItem) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FEEDBACK_NOT_FOUND' }), ...adminErrors,
  },
});

registry.registerPath({
  method: 'delete', path: '/api/v1/admin/feedbacks/{feedbackId}', tags: ['Admin · Feedback'], security: [{ [adminAuth.name]: [] }],
  summary: '피드백 삭제',
  description: '본문에 이용자가 개인정보를 적었을 때 지우는 용도',
  request: { params: feedbackIdParams },
  responses: {
    200: { description: '삭제됨', content: { 'application/json': { schema: success(z.null()) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT', 404: 'FEEDBACK_NOT_FOUND' }), ...adminErrors,
  },
});
