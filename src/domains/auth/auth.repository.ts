import { prisma } from '../../config/prisma.js';
import { LOCK_AFTER, LOCK_MS } from './auth.policy.js';

export const authRepository = {
  findUser: (username: string) => prisma().adminUser.findUnique({ where: { username } }),

  /**
   * 실패 1번 기록. LOCK_AFTER번째 실패면 LOCK_MS 동안 잠근다. 잠금이 풀린 뒤 첫 실패는 1부터 다시 센다.
   * 동시에 여러 번 틀려도 정확히 세도록 한 문장으로 올린다.
   */
  recordFailure: async (id: string) => {
    const rows = await prisma().$queryRaw<{ failed_count: number; locked_until: Date | null }[]>`
      UPDATE admin_user
      SET failed_count = CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_count + 1 END,
          locked_until = CASE
            WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL
            WHEN failed_count + 1 >= ${LOCK_AFTER} THEN now() + ${`${LOCK_MS} milliseconds`}::interval
            ELSE locked_until END,
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING failed_count, locked_until`;
    return rows[0];
  },

  recordSuccess: (id: string) =>
    prisma().adminUser.update({ where: { id }, data: { failedCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),

  createSession: (data: { id: string; userId: string; expiresAt: Date }) => prisma().adminSession.create({ data }),

  findSession: (id: string) =>
    prisma().adminSession.findUnique({ where: { id }, include: { user: { select: { username: true, disabled: true } } } }),

  // 동시에 로그아웃돼 세션이 없어도 오류가 나지 않게 updateMany
  touchSession: (id: string) => prisma().adminSession.updateMany({ where: { id }, data: { lastSeenAt: new Date() } }),

  deleteSession: (id: string) => prisma().adminSession.deleteMany({ where: { id } }),

  deleteExpiredSessions: (idleBefore: Date) =>
    prisma().adminSession.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, { lastSeenAt: { lte: idleBefore } }] } }),
};
