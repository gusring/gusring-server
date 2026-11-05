import { prisma } from '../../config/prisma.js';
import { hashPassword } from '../../utils/password.js';
import { auditRepository } from '../audit/audit.repository.js';
import { USERNAME_RE, checkNewPassword } from './auth.schema.js';

// 관리자 계정 관리. 서버 명령(src/cli/admin-user.ts)에서만 쓴다 (API로 열지 않음).
// 결과·오류 문구는 그대로 터미널에 보여 준다.

const ACTOR = 'cli';

function assertUsername(username: string) {
  if (!USERNAME_RE.test(username)) throw new Error('아이디는 영문 소문자로 시작하는 소문자·숫자·. _ - 3~32자여야 합니다.');
}

function assertPassword(password: string) {
  const problem = checkNewPassword(password);
  if (problem) throw new Error(problem);
}

async function mustFind(username: string) {
  const user = await prisma().adminUser.findUnique({ where: { username } });
  if (!user) throw new Error(`없는 계정입니다: ${username}`);
  return user;
}

export const adminUserService = {
  async list() {
    return prisma().adminUser.findMany({
      select: { username: true, disabled: true, lockedUntil: true, lastLoginAt: true, createdAt: true, _count: { select: { sessions: true } } },
      orderBy: { username: 'asc' },
    });
  },

  async create(username: string, password: string) {
    assertUsername(username);
    assertPassword(password);
    if (await prisma().adminUser.findUnique({ where: { username } })) throw new Error(`이미 있는 계정입니다: ${username}`);
    await prisma().adminUser.create({ data: { username, passwordHash: await hashPassword(password) } });
    await auditRepository.log(ACTOR, 'user.create', username);
  },

  /** 비밀번호를 바꾸면 그 계정의 로그인을 모두 끊고 잠금도 푼다 */
  async setPassword(username: string, password: string) {
    assertPassword(password);
    const user = await mustFind(username);
    await prisma().$transaction([
      prisma().adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), failedCount: 0, lockedUntil: null } }),
      prisma().adminSession.deleteMany({ where: { userId: user.id } }),
    ]);
    await auditRepository.log(ACTOR, 'user.password', username);
  },

  /** 막으면 지금 로그인도 바로 끊긴다 */
  async disable(username: string) {
    const user = await mustFind(username);
    await prisma().$transaction([
      prisma().adminUser.update({ where: { id: user.id }, data: { disabled: true } }),
      prisma().adminSession.deleteMany({ where: { userId: user.id } }),
    ]);
    await auditRepository.log(ACTOR, 'user.disable', username);
  },

  async enable(username: string) {
    const user = await mustFind(username);
    await prisma().adminUser.update({ where: { id: user.id }, data: { disabled: false } });
    await auditRepository.log(ACTOR, 'user.enable', username);
  },

  async unlock(username: string) {
    const user = await mustFind(username);
    await prisma().adminUser.update({ where: { id: user.id }, data: { failedCount: 0, lockedUntil: null } });
    await auditRepository.log(ACTOR, 'user.unlock', username);
  },
};
