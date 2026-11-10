import { z } from '../../config/zod.js';
import { PASSWORD_MAX } from '../../utils/password.js';
import { roleSchema } from '../auth/auth.schema.js';

export const usernameParams = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64).openapi({ example: 'gc-officer' }),
});

// 아이디·비밀번호 규칙(형식, 10자 이상 등)은 서비스(admin-user.service)에서 계정 명령과 같은 문구로 본다
export const createUserBody = z
  .object({
    username: z.string().trim().toLowerCase().min(1).max(64).openapi({ description: '영문 소문자로 시작, 소문자·숫자·. _ - 3~32자', example: 'gc-officer' }),
    role: roleSchema.default('staff'),
    temporaryPassword: z.string().min(1).max(PASSWORD_MAX).openapi({ format: 'password', description: '10자 이상. 받은 사람이 처음 로그인 때 바꿔야 한다' }),
  })
  .strict()
  .openapi('CreateAdminUserBody');
export type CreateUserBody = z.infer<typeof createUserBody>;

export const updateUserBody = z
  .object({
    role: roleSchema.optional(),
    disabled: z.boolean().optional().openapi({ description: 'true면 막기(바로 로그아웃), false면 풀기' }),
  })
  .strict()
  .refine((b) => b.role !== undefined || b.disabled !== undefined, { message: 'role 또는 disabled 중 하나는 있어야 합니다' })
  .openapi('UpdateAdminUserBody');
export type UpdateUserBody = z.infer<typeof updateUserBody>;

export const resetPasswordBody = z
  .object({ temporaryPassword: z.string().min(1).max(PASSWORD_MAX).openapi({ format: 'password' }) })
  .strict()
  .openapi('ResetAdminPasswordBody');

export const adminUserItem = z
  .object({
    username: z.string(),
    role: roleSchema,
    disabled: z.boolean(),
    mustChangePassword: z.boolean().openapi({ description: '임시 비밀번호를 아직 안 바꿈' }),
    lockedUntil: z.string().nullable().openapi({ format: 'date-time', description: '5번 실패로 잠긴 경우 풀리는 시각' }),
    lastLoginAt: z.string().nullable().openapi({ format: 'date-time' }),
    createdAt: z.string().openapi({ format: 'date-time' }),
    sessions: z.number().openapi({ description: '지금 로그인 중인 곳 수' }),
  })
  .openapi('AdminUser');
