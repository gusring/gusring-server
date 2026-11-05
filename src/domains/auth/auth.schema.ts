import { z } from '../../config/zod.js';
import { PASSWORD_MAX, PASSWORD_MIN } from '../../utils/password.js';

/** 관리자 아이디: 영문 소문자로 시작, 소문자·숫자·. _ - 3~32자 */
export const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;

export const loginBody = z
  .object({
    // 로그인 때는 형식이 틀려도 "아이디 또는 비밀번호가 맞지 않습니다"로 같게 답하려고 길이만 본다
    username: z.string().trim().toLowerCase().min(1).max(64).openapi({ example: 'eunhyeon' }),
    password: z.string().min(1).max(PASSWORD_MAX).openapi({ format: 'password' }),
  })
  .strict()
  .openapi('LoginBody');
export type LoginBody = z.infer<typeof loginBody>;

export const meData = z.object({ username: z.string().openapi({ example: 'eunhyeon' }) }).openapi('AdminMe');

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX).openapi({ format: 'password' }),
    // 규칙(10자 이상 등)은 서비스에서 checkNewPassword로 본다 (계정 명령과 같은 문구)
    newPassword: z.string().min(1).max(PASSWORD_MAX).openapi({ format: 'password', description: `${PASSWORD_MIN}자 이상, 앞뒤 공백 불가, 지금과 달라야 함` }),
  })
  .strict()
  .openapi('ChangePasswordBody');
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

/** 새 비밀번호 규칙 (계정 만들기·바꾸기) */
export function checkNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  if (password.length > PASSWORD_MAX) return `비밀번호는 ${PASSWORD_MAX}자 이하여야 합니다.`;
  if (password.trim() !== password) return '비밀번호 앞뒤에 공백을 넣을 수 없습니다.';
  return null;
}
