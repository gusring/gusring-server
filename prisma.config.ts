import { defineConfig } from 'prisma/config';

// Prisma CLI는 .env를 자동으로 읽지 않는다 (Prisma 7). 있으면 읽고, 없으면 넘어간다.
try {
  process.loadEnvFile('.env');
} catch {
  /* .env 없음 — 환경변수가 이미 설정돼 있다고 본다 */
}

// DATABASE_URL은 migrate처럼 DB에 붙는 명령에만 필요하다.
// generate(설치 직후·빌드)는 주소 없이도 돼야 하므로, 있을 때만 넘긴다.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
