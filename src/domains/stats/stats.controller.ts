import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { statsService } from './stats.service.js';
import type { FormStatsQuery, StatsQuery } from './stats.schema.js';

const q = (res: Parameters<RequestHandler>[1]) => res.locals.query as StatsQuery;

export const statsController = {
  summary: (async (_req, res) => {
    sendSuccess(res, { message: '기간 합계입니다.', data: await statsService.summary(q(res)) });
  }) satisfies RequestHandler,

  forms: (async (_req, res) => {
    sendSuccess(res, { message: '서식별 통계입니다.', data: await statsService.forms(res.locals.query as FormStatsQuery) });
  }) satisfies RequestHandler,

  daily: (async (_req, res) => {
    sendSuccess(res, { message: '날짜별 통계입니다.', data: await statsService.daily(q(res)) });
  }) satisfies RequestHandler,

  search: (async (_req, res) => {
    sendSuccess(res, { message: '검색어 통계입니다.', data: await statsService.search(q(res)) });
  }) satisfies RequestHandler,

  fill: (async (_req, res) => {
    sendSuccess(res, { message: '작성 도우미 통계입니다.', data: await statsService.fill(q(res)) });
  }) satisfies RequestHandler,

  // 파일 내려받기라 공통 응답 형식으로 감싸지 않는다
  exportCsv: (async (_req, res) => {
    const { filename, body } = await statsService.exportCsv(q(res));
    res.type('text/csv; charset=utf-8').attachment(filename).send(body);
  }) satisfies RequestHandler,
};
