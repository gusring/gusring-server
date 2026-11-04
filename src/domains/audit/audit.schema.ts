import { z } from '../../config/zod.js';
import { pageQuery } from '../../utils/common-schema.js';

export const AUDIT_ACTIONS = ['login', 'login_failed', 'logout', 'feedback.status', 'feedback.delete', 'user.create', 'user.password', 'user.disable', 'user.enable', 'user.unlock'] as const;

export const listAuditQuery = pageQuery.extend({
  actor: z.string().max(64).optional().openapi({ description: '관리자 아이디 (토큰은 token, 서버 명령은 cli)' }),
  action: z.enum(AUDIT_ACTIONS).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuery>;

export const auditItem = z
  .object({
    id: z.string(),
    actor: z.string().openapi({ example: 'eunhyeon' }),
    action: z.string().openapi({ example: 'feedback.status' }),
    target: z.string().nullable().openapi({ description: '대상 id (피드백 id, 계정 아이디)' }),
    detail: z.unknown().nullable().openapi({ example: { status: 'resolved' } }),
    createdAt: z.string().openapi({ format: 'date-time' }),
  })
  .openapi('AuditLog');
