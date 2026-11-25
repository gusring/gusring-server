import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/response.js';

// zod 검사 미들웨어. 통과한 값은 res.locals.body / query / params 에 둔다
// (Express 5의 req.query는 읽기 전용이라 덮어쓸 수 없다).

function check<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError('COMMON_INVALID_INPUT', undefined, details);
  }
  return result.data;
}

export const validateBody = (schema: z.ZodType): RequestHandler => (req, res, next) => {
  res.locals.body = check(schema, req.body);
  next();
};

export const validateQuery = (schema: z.ZodType): RequestHandler => (req, res, next) => {
  res.locals.query = check(schema, req.query);
  next();
};

export const validateParams = (schema: z.ZodType): RequestHandler => (req, res, next) => {
  res.locals.params = check(schema, req.params);
  next();
};
