import { defineConfig, env } from 'prisma/config';

// Prisma CLI는 .env를 자동으로 읽지 않는다 (Prisma 7). 있으면 읽고, 없으면 넘어간다.
try {
  process.loadEnvFile('.env');
} catch {
  /* .env 없음 — 환경변수가 이미 설정돼 있다고 본다 */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
