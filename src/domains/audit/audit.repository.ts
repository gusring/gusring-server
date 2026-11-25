import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ListAuditQuery } from './audit.schema.js';

export const auditRepository = {
  /** detail에는 피드백 본문 같은 이용자 글을 넣지 않는다 */
  log: (actor: string, action: string, target: string | null = null, detail?: Prisma.InputJsonValue) =>
    prisma().adminAuditLog.create({ data: { actor, action, target, detail } }),

  findPage: async (q: ListAuditQuery) => {
    const where = { actor: q.actor, action: q.action };
    const [total, rows] = await Promise.all([
      prisma().adminAuditLog.count({ where }),
      prisma().adminAuditLog.findMany({ where, orderBy: { id: 'desc' }, skip: q.offset, take: q.limit }),
    ]);
    return { total, items: rows.map((r) => ({ ...r, id: r.id.toString() })) };
  },
};
