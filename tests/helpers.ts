import { afterAll, beforeEach } from 'vitest';
import { db, disconnectDb } from '../src/db.js';

export const ADMIN = { Authorization: 'Bearer test-admin-token' };
export const VISITOR = '11111111-1111-4111-8111-111111111111';
export const VISITOR2 = '22222222-2222-4222-8222-222222222222';

/** 각 테스트 전에 테이블을 비운다 */
export function useCleanDb() {
  beforeEach(async () => {
    await db().$executeRawUnsafe('TRUNCATE feedback, usage_event RESTART IDENTITY');
  });
  afterAll(async () => {
    await disconnectDb();
  });
}
