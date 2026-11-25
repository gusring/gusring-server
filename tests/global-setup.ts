import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from '../vitest.config.js';

// 테스트 시작 전에 테스트 DB에 마이그레이션을 적용한다.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
