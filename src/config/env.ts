// 환경변수 읽기. 값이 없으면 개발용 기본값을 쓴다.
// DB·관리자·IP 해시 값은 쓰는 시점에 확인한다 (/health는 DB 없이도 떠야 하므로).

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT 값이 올바르지 않습니다: ${value}`);
  }
  return port;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return DEFAULT_ORIGINS;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 앞단 프록시 개수 (Vercel은 1). 0이면 연결 주소를 그대로 IP로 쓴다 */
function parseTrustProxy(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  databaseUrl: process.env.DATABASE_URL,
  adminToken: process.env.ADMIN_TOKEN,
  ipHashSecret: process.env.IP_HASH_SECRET,
};

export function required(name: 'databaseUrl' | 'ipHashSecret'): string {
  const value = env[name];
  if (!value) throw new Error(`환경변수가 없습니다: ${name === 'databaseUrl' ? 'DATABASE_URL' : 'IP_HASH_SECRET'}`);
  return value;
}
