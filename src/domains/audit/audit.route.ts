import { Router, type RequestHandler } from 'express';
import { z } from '../../config/zod.js';
import { adminSecurity, errors, registry } from '../../config/openapi.js';
import { validateQuery } from '../../middlewares/validate.js';
import { pageSchema, success } from '../../utils/common-schema.js';
import { sendSuccess } from '../../utils/response.js';
import { auditRepository } from './audit.repository.js';
import { auditItem, listAuditQuery, type ListAuditQuery } from './audit.schema.js';

// 조회만 있어서 컨트롤러·서비스를 따로 두지 않는다
const list: RequestHandler = async (_req, res) => {
  const q = res.locals.query as ListAuditQuery;
  const { total, items } = await auditRepository.findPage(q);
  sendSuccess(res, { message: '관리 기록입니다.', data: items, page: { offset: q.offset, limit: q.limit, total } });
};

// ── 관리자: /api/v1/admin/audit-logs ──
export const adminAuditRouter = Router();
adminAuditRouter.get('/', validateQuery(listAuditQuery), list);

registry.registerPath({
  method: 'get', path: '/api/v1/admin/audit-logs', tags: ['Admin · Audit'], security: adminSecurity,
  summary: '관리 기록 (최신순)',
  description: '로그인·로그인 실패·피드백 상태 변경·삭제·계정 관리. 피드백 본문은 남기지 않는다.',
  request: { query: listAuditQuery },
  responses: {
    200: { description: '목록', content: { 'application/json': { schema: success(z.array(auditItem)).extend({ page: pageSchema }) } } },
    ...errors({ 400: 'COMMON_INVALID_INPUT', 401: 'AUTH_ADMIN_REQUIRED' }),
  },
});
