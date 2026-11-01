import { z } from 'zod';

// 요청 검증에 함께 쓰는 조각

export const langSchema = z.enum(['ko', 'en', 'zh', 'ja', 'vi']);

/** 서식 식별자 (예: birth-report) */
export const formKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, '영문 소문자·숫자·하이픈 1~64자');

/** gusring-web 서식 번호 */
export const formNoSchema = z.number().int().min(1).max(999);

/** 작성 도우미 칸 id (예: childNameKo) */
export const fieldIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '영문으로 시작하는 1~64자');
