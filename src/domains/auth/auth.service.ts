import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../utils/response.js';
import { dummyHash, hashPassword, verifyPassword } from '../../utils/password.js';
import { auditRepository } from '../audit/audit.repository.js';
import { authRepository as repo } from './auth.repository.js';
import { SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_TOUCH_MS } from './auth.policy.js';
import { checkNewPassword } from './auth.schema.js';

/** 쿠키 값은 DB에 두지 않고 해시만 둔다 (DB가 새도 세션을 훔쳐 쓸 수 없게) */
const sessionId = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AdminIdentity {
  username: string;
  via: 'session' | 'token';
}

export const authService = {
  /** 성공하면 쿠키에 넣을 값. 실패 이유는 바깥에 구분해 알리지 않는다 (잠금만 따로) */
  async login(username: string, password: string): Promise<{ token: string; username: string }> {
    const user = await repo.findUser(username);
    if (!user || user.disabled) {
      await verifyPassword(password, await dummyHash()); // 없는 아이디도 같은 시간이 걸리게
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('AUTH_LOGIN_LOCKED');

    if (!(await verifyPassword(password, user.passwordHash))) {
      const after = await repo.recordFailure(user.id);
      await auditRepository.log(user.username, 'login_failed', null, { failedCount: after?.failed_count ?? null });
      if (after?.locked_until && after.locked_until > new Date()) throw new AppError('AUTH_LOGIN_LOCKED');
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    }

    await repo.recordSuccess(user.id);
    await repo.deleteExpiredSessions(new Date(Date.now() - SESSION_IDLE_MS));
    const token = randomBytes(32).toString('base64url');
    await repo.createSession({ id: sessionId(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_MAX_MS) });
    await auditRepository.log(user.username, 'login');
    return { token, username: user.username };
  },

  /** 쿠키 값으로 관리자 확인. 만료·장시간 미사용·막힌 계정이면 null (세션도 지운다) */
  async authenticate(token: string): Promise<AdminIdentity | null> {
    const id = sessionId(token);
    const session = await repo.findSession(id);
    if (!session) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() <= now - SESSION_IDLE_MS || session.user.disabled) {
      await repo.deleteSession(id);
      return null;
    }
    if (session.lastSeenAt.getTime() <= now - SESSION_TOUCH_MS) await repo.touchSession(id);
    return { username: session.user.username, via: 'session' };
  },

  /**
   * 로그인한 관리자가 자기 비밀번호를 바꾼다. 지금 비밀번호가 틀리면 로그인 실패와 같이 세어 5번이면 잠근다
   * (켜 둔 화면을 남이 쓰는 경우 대비). 바꾸면 지금 세션만 남기고 다른 곳의 로그인은 끊는다.
   */
  async changePassword(username: string, sessionToken: string, currentPassword: string, newPassword: string) {
    const user = await repo.findUser(username);
    if (!user || user.disabled) throw new AppError('AUTH_ADMIN_REQUIRED');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('AUTH_LOGIN_LOCKED');

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      const after = await repo.recordFailure(user.id);
      await auditRepository.log(user.username, 'password_failed', null, { failedCount: after?.failed_count ?? null });
      if (after?.locked_until && after.locked_until > new Date()) throw new AppError('AUTH_LOGIN_LOCKED');
      throw new AppError('AUTH_WRONG_PASSWORD');
    }

    const problem = checkNewPassword(newPassword) ?? (newPassword === currentPassword ? '새 비밀번호가 지금 비밀번호와 같습니다.' : null);
    if (problem) throw new AppError('COMMON_INVALID_INPUT', problem, [{ path: 'newPassword', message: problem }]);

    await repo.changePassword(user.id, await hashPassword(newPassword), sessionId(sessionToken));
    await auditRepository.log(user.username, 'user.password', user.username, { by: 'self' });
  },

  async logout(token: string | undefined, username?: string) {
    if (!token) return;
    const { count } = await repo.deleteSession(sessionId(token));
    if (count > 0 && username) await auditRepository.log(username, 'logout');
  },
};
