import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, sendError } from '../utils/response.js';

export const notFound: RequestHandler = (req, res) => {
  sendError(res, new AppError('COMMON_NOT_FOUND', `${req.method} ${req.path} 경로가 없습니다.`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err);
    return;
  }
  // express.json() 등이 던지는 4xx (깨진 JSON → 400, 너무 큰 본문 → 413)
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    sendError(res, new AppError(err.status === 413 ? 'COMMON_PAYLOAD_TOO_LARGE' : 'COMMON_BAD_REQUEST'));
    return;
  }
  console.error(err);
  sendError(res, new AppError('COMMON_INTERNAL_ERROR'));
};
