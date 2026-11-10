import { prisma } from '../../config/prisma.js';
import type { AdminRole, Prisma } from '../../generated/prisma/client.js';
import { hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/response.js';
import { USERNAME_RE, checkNewPassword } from './auth.schema.js';

// 관리자 계정 관리. 관리자 화면(계정 관리자, src/domains/users)과 비상용 서버 명령(src/cli/admin-user.ts)이 같이 쓴다.
// 계정을 바꾸는 일은 한 번에 하나씩(DB 잠금) 해서 "계정 관리자가 한 명은 남는다"는 규칙이 동시 요청에도 깨지지 않게 한다.

type Tx = Prisma.TransactionClient;
const USERS_LOCK = 4_710_001; // pg_advisory_xact_lock 키 (계정 변경 전용)

function assertUsername(username: string) {
  if (!USERNAME_RE.test(username)) {
    const message = '아이디는 영문 소문자로 시작하는 소문자·숫자·. _ - 3~32자여야 합니다.';
    throw new AppError('COMMON_INVALID_INPUT', message, [{ path: 'username', message }]);
  }
}

function assertPassword(password: string, path = 'password') {
  const problem = checkNewPassword(password);
  if (problem) throw new AppError('COMMON_INVALID_INPUT', problem, [{ path, message: problem }]);
}

/** 계정 변경을 한 줄로 세우고, 대상 계정을 찾는다 */
async function locked<T>(username: string | null, fn: (tx: Tx, user: Prisma.AdminUserGetPayload<object> | null) => Promise<T>) {
  return prisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USERS_LOCK})`;
    const user = username ? await tx.adminUser.findUnique({ where: { username } }) : null;
    if (username && !user) throw new AppError('USER_NOT_FOUND', `없는 계정입니다: ${username}`);
    return fn(tx, user);
  });
}

/** 이 계정을 바꾸고 나면 쓸 수 있는 계정 관리자가 한 명도 안 남는지 */
async function wouldLeaveNoManager(tx: Tx, userId: string) {
  const others = await tx.adminUser.count({ where: { role: 'manager', disabled: false, id: { not: userId } } });
  return others === 0;
}

const audit = (tx: Tx, actor: string, action: string, target: string, detail?: Prisma.InputJsonValue) =>
  tx.adminAuditLog.create({ data: { actor, action, target, detail } });

export interface AdminUserRow {
  username: string;
  role: AdminRole;
  disabled: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  sessions: number;
}

export const adminUserService = {
  async list(): Promise<AdminUserRow[]> {
    const rows = await prisma().adminUser.findMany({
      select: {
        username: true, role: true, disabled: true, mustChangePassword: true,
        lockedUntil: true, lastLoginAt: true, createdAt: true, _count: { select: { sessions: true } },
      },
      orderBy: { username: 'asc' },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, sessions: _count.sessions }));
  },

  /** mustChange: 다른 사람이 정해 준 임시 비밀번호면 true (받은 사람이 처음 로그인 때 바꿔야 함) */
  async create(username: string, password: string, opts: { role: AdminRole; actor: string; mustChange: boolean }) {
    assertUsername(username);
    assertPassword(password);
    const passwordHash = await hashPassword(password);
    await locked(null, async (tx) => {
      if (await tx.adminUser.findUnique({ where: { username } })) throw new AppError('USER_ALREADY_EXISTS', `이미 있는 계정입니다: ${username}`);
      await tx.adminUser.create({ data: { username, passwordHash, role: opts.role, mustChangePassword: opts.mustChange } });
      await audit(tx, opts.actor, 'user.create', username, { role: opts.role });
    });
  },

  /** 비밀번호를 정해 준다(초기화). 그 계정의 로그인을 모두 끊고 잠금도 푼다 */
  async setPassword(username: string, password: string, opts: { actor: string; mustChange: boolean }) {
    assertPassword(password);
    const passwordHash = await hashPassword(password);
    await locked(username, async (tx, user) => {
      await tx.adminUser.update({
        where: { id: user!.id },
        data: { passwordHash, mustChangePassword: opts.mustChange, failedCount: 0, lockedUntil: null },
      });
      await tx.adminSession.deleteMany({ where: { userId: user!.id } });
      await audit(tx, opts.actor, 'user.password', username, { by: opts.actor === 'cli' ? 'cli' : 'admin', temporary: opts.mustChange });
    });
  },

  /** 막으면 지금 로그인도 바로 끊긴다. 마지막 계정 관리자는 막을 수 없다 */
  async setDisabled(username: string, disabled: boolean, actor: string) {
    await locked(username, async (tx, user) => {
      if (user!.disabled === disabled) return;
      if (disabled && user!.role === 'manager' && (await wouldLeaveNoManager(tx, user!.id))) throw new AppError('USER_LAST_MANAGER');
      await tx.adminUser.update({ where: { id: user!.id }, data: { disabled } });
      if (disabled) await tx.adminSession.deleteMany({ where: { userId: user!.id } });
      await audit(tx, actor, disabled ? 'user.disable' : 'user.enable', username);
    });
  },

  /** 마지막 계정 관리자를 일반 관리자로 바꿀 수 없다 */
  async setRole(username: string, role: AdminRole, actor: string) {
    await locked(username, async (tx, user) => {
      if (user!.role === role) return;
      if (role === 'staff' && !user!.disabled && (await wouldLeaveNoManager(tx, user!.id))) throw new AppError('USER_LAST_MANAGER');
      await tx.adminUser.update({ where: { id: user!.id }, data: { role } });
      await audit(tx, actor, 'user.role', username, { from: user!.role, to: role });
    });
  },

  async unlock(username: string, actor: string) {
    await locked(username, async (tx, user) => {
      await tx.adminUser.update({ where: { id: user!.id }, data: { failedCount: 0, lockedUntil: null } });
      await audit(tx, actor, 'user.unlock', username);
    });
  },

  // 서버 명령에서 쓰던 이름 (비상용)
  disable: (username: string, actor = 'cli') => adminUserService.setDisabled(username, true, actor),
  enable: (username: string, actor = 'cli') => adminUserService.setDisabled(username, false, actor),
};
