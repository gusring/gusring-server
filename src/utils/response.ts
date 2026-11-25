import type { Response } from 'express';
import { ERROR_CODE, type ErrorCode } from '../constants/error-code.js';

// 응답은 모두 여기를 거친다 (docs/convention.md 3절)

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_CODE[code].message);
    this.status = ERROR_CODE[code].status;
  }
}

export interface Page {
  offset: number;
  limit: number;
  total: number;
}

export function sendSuccess<T>(
  res: Response,
  opts: { status?: number; message: string; data: T; page?: Page },
) {
  const { status = 200, message, data, page } = opts;
  res.status(status).json({ success: true, message, data, ...(page ? { page } : {}) });
}

export function sendError(res: Response, err: AppError) {
  const error = err.details === undefined ? { code: err.code } : { code: err.code, details: err.details };
  res.status(err.status).json({ success: false, message: err.message, error });
}
