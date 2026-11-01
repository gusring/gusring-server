import { defineConfig } from 'vitest/config';

// 테스트는 Docker의 gusring_test DB를 쓴다 (docker compose up -d 필요).
// 모든 값은 로컬 테스트 전용이다.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://gusring:gusring@localhost:5433/gusring_test';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      ADMIN_TOKEN: 'test-admin-token',
      IP_HASH_SECRET: 'test-ip-hash-secret',
      CORS_ORIGIN: 'http://localhost:3000',
    },
    globalSetup: ['tests/global-setup.ts'],
    // 같은 DB를 쓰므로 파일을 하나씩 돌린다
    fileParallelism: false,
  },
});
