import express, { Router, type RequestHandler } from 'express';
import { errors, registry } from '../../config/openapi.js';
import { validateBody } from '../../middlewares/validate.js';
import { success } from '../../utils/common-schema.js';
import { AppError } from '../../utils/response.js';
import { eventController as c } from './event.controller.js';
import { acceptedData, createEventsBody } from './event.schema.js';

// navigator.sendBeacon은 본문을 text/plain으로 보낸다 → 문자열이면 JSON으로 읽는다
const parseBeaconText: RequestHandler = (req, _res, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      throw new AppError('COMMON_BAD_REQUEST');
    }
  }
  next();
};

// ── 공개: /api/v1/events ──
export const eventRouter = Router();
eventRouter.post('/', express.text({ type: 'text/plain', limit: '64kb' }), parseBeaconText, validateBody(createEventsBody), c.create);

registry.registerPath({
  method: 'post', path: '/api/v1/events', tags: ['Event'],
  summary: '이용 기록 묶음 저장',
  description:
    '최대 20개. 페이지를 떠날 때 `navigator.sendBeacon`(text/plain)으로 보내도 된다. ' +
    'Nginx에서 IP당 분당 60건(순간 40) 제한. 정의되지 않은 칸이 섞이면 묶음 전체를 거부한다.',
  request: { body: { content: { 'application/json': { schema: createEventsBody }, 'text/plain': { schema: createEventsBody } } } },
  responses: {
    202: { description: '받음', content: { 'application/json': { schema: success(acceptedData) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT · COMMON_BAD_REQUEST', 413: 'COMMON_PAYLOAD_TOO_LARGE', 429: 'COMMON_TOO_MANY_REQUESTS(Nginx)' }),
  },
});
