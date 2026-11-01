import type { z } from 'zod';
import { HttpError } from '../middlewares/error-handler.js';

/** Zod로 검사하고, 틀리면 400 VALIDATION_ERROR (어느 칸이 왜 틀렸는지 포함) */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다.', details);
  }
  return result.data;
}
