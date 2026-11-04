import type { RequestHandler } from 'express';
import { currentAdmin } from '../../middlewares/admin-auth.js';
import { sendSuccess } from '../../utils/response.js';
import { feedbackService } from './feedback.service.js';
import type { CreateFeedbackBody, ListFeedbackQuery } from './feedback.schema.js';

export const feedbackController = {
  create: (async (req, res) => {
    const id = await feedbackService.create(res.locals.body as CreateFeedbackBody, req.ip);
    sendSuccess(res, { status: 201, message: '피드백을 저장했습니다.', data: { id } });
  }) satisfies RequestHandler,

  list: (async (_req, res) => {
    const q = res.locals.query as ListFeedbackQuery;
    const { total, items } = await feedbackService.list(q);
    sendSuccess(res, { message: '피드백 목록입니다.', data: items, page: { offset: q.offset, limit: q.limit, total } });
  }) satisfies RequestHandler,

  updateStatus: (async (_req, res) => {
    const { feedbackId } = res.locals.params as { feedbackId: string };
    const { status } = res.locals.body as { status: 'new' | 'read' | 'resolved' };
    const item = await feedbackService.updateStatus(feedbackId, status, currentAdmin(res).username);
    sendSuccess(res, { message: '처리 상태를 바꿨습니다.', data: item });
  }) satisfies RequestHandler,

  remove: (async (_req, res) => {
    const { feedbackId } = res.locals.params as { feedbackId: string };
    await feedbackService.remove(feedbackId, currentAdmin(res).username);
    sendSuccess(res, { message: '피드백을 삭제했습니다.', data: null });
  }) satisfies RequestHandler,
};
