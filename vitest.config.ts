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
    // 관리자 로그인 테스트는 비밀번호 해시(scrypt, 한 번 약 0.12초)를 여러 번 해서, PC가 바쁘면 기본 5초를 넘긴다
    // (2026-11-10 배포 때 실패로 확인). 운영 해시 강도는 그대로 두고 제한만 늘린다
    testTimeout: 30_000,
    coverage: {
      include: ['src/**'],
      exclude: ['src/generated/**', 'src/server.ts'],
      reporter: ['text'],
    },
  },
});
