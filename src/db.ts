import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { required } from './config/env.js';

// 처음 쓸 때 만든다. /health처럼 DB가 필요 없는 요청은 DB 없이도 동작.
let client: PrismaClient | undefined;

export function db(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: required('databaseUrl') }) });
  return client;
}

export async function disconnectDb() {
  await client?.$disconnect();
  client = undefined;
}
