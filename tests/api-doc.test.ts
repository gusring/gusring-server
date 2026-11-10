import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ERROR_CODE } from '../src/constants/error-code.js';

// docs/api.md(사람이 읽는 표)가 코드·Swagger와 어긋나지 않는지
const doc = readFileSync(new URL('../docs/api.md', import.meta.url), 'utf8');

describe('docs/api.md', () => {
  it('Swagger의 모든 경로가 목록 표에 있고, 없는 경로는 없다', async () => {
    const { body } = await request(createApp()).get('/api-docs.json');
    const rows = [...doc.matchAll(/^\| (GET|POST|PATCH|DELETE) \| `([^`]+)` \|/gm)].map((m) => `${m[1]} ${m[2]}`);
    const ops = Object.entries(body.paths as Record<string, object>).flatMap(([p, o]) =>
      Object.keys(o).map((m) => `${m.toUpperCase()} ${p}`),
    );
    expect(rows.sort()).toEqual(ops.sort());
  });

  it('모든 에러 코드가 같은 HTTP 상태로 표에 있고, 없는 코드는 없다', () => {
    const inDoc = Object.fromEntries([...doc.matchAll(/^\| `([A-Z_]+)` \| (\d{3}) \|/gm)].map((m) => [m[1], Number(m[2])]));
    const inCode = Object.fromEntries(Object.entries(ERROR_CODE).map(([k, v]) => [k, v.status]));
    expect(inDoc).toEqual(inCode);
  });
});
