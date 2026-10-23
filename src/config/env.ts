// 환경변수 읽기. 값이 없으면 개발용 기본값을 쓴다.

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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
};
