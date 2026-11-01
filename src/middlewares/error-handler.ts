import type { ErrorRequestHandler, RequestHandler } from 'express';

// 모든 에러 응답은 { error: { code, message, details? } } 형태로 맞춘다.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} 경로가 없습니다.` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const details = err.details === undefined ? {} : { details: err.details };
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...details } });
    return;
  }
  // express.json() 등 미들웨어가 던지는 4xx (예: 깨진 JSON → 400)
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
};
