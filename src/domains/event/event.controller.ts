import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { eventService } from './event.service.js';
import type { CreateEventsBody } from './event.schema.js';

export const eventController = {
  create: (async (_req, res) => {
    const accepted = await eventService.record(res.locals.body as CreateEventsBody);
    sendSuccess(res, { status: 202, message: '이용 기록을 받았습니다.', data: { accepted } });
  }) satisfies RequestHandler,
};
