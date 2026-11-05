import { z } from '../config/zod.js';
import { LANGS } from '../constants/enums.js';
import { ERROR_CODES } from '../constants/error-code.js';

// 여러 도메인이 함께 쓰는 zod 조각 (검증 + Swagger 문서)

export const langSchema = z.enum(LANGS).openapi({ description: '화면 언어', example: 'ja' });

/** 서식 식별자 (예: birth-report) */
export const formKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, '영문 소문자·숫자·하이픈 1~64자')
  .openapi({ description: '서식 식별자 (작성 도우미)', example: 'birth-report' });

/** gusring-web 서식 번호 */
export const formNoSchema = z.number().int().min(1).max(999).openapi({ description: 'gusring-web 서식 번호', example: 4 });

/** 작성 도우미 칸 id (예: childNameKo) */
export const fieldIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '영문으로 시작하는 1~64자')
  .openapi({ description: '작성 도우미 칸 id', example: 'childNameKo' });

/** 통계 기간 (한국 날짜, to 포함) */
export const dateRangeQuery = z.object({
  from: z.string().optional().openapi({ description: '시작일 YYYY-MM-DD (한국 시간). 없으면 to - 29일', example: '2026-11-01' }),
  to: z.string().optional().openapi({ description: '끝일 YYYY-MM-DD (포함). 없으면 오늘', example: '2026-11-30' }),
});

/** 목록 페이지 */
export const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).max(100000).default(0).openapi({ example: 0 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
});

export const pageSchema = z.object({ offset: z.number(), limit: z.number(), total: z.number() }).openapi('Page');

// ── Swagger 문서용 공통 응답 ──
export const success = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), message: z.string(), data });

export const errorResponse = z
  .object({
    success: z.literal(false),
    message: z.string().openapi({ example: '입력값이 올바르지 않습니다.' }),
    error: z.object({
      code: z.enum(ERROR_CODES).openapi({ example: 'COMMON_INVALID_INPUT' }),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .openapi('ErrorResponse');
