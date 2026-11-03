import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ERROR_CODE } from '../src/constants/error-code.js';

const app = createApp();

describe('GET /health', () => {
  it('공통 성공 형식으로 status ok를 돌려준다', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: '정상입니다.', data: { status: 'ok' } });
  });
});

describe('없는 경로', () => {
  it('404를 공통 실패 형식으로 돌려준다', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'GET /nope 경로가 없습니다.', error: { code: 'COMMON_NOT_FOUND' } });
  });

  it.each(['/feedback', '/events', '/admin/feedback', '/api/feedbacks'])('버전 없는 예전 경로 %s는 404', async (path) => {
    expect((await request(app).post(path).send({})).status).toBe(404);
  });
});

describe('CORS', () => {
  it('허용한 주소에는 Access-Control-Allow-Origin을 붙인다', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('허용하지 않은 주소에는 붙이지 않는다', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('보안 헤더', () => {
  it('모든 응답에 iframe 금지·Referrer 없음, X-Powered-By 없음', async () => {
    for (const path of ['/health', '/api-docs/', '/nope']) {
      const res = await request(app).get(path);
      expect(res.headers['x-frame-options'], path).toBe('DENY');
      expect(res.headers['referrer-policy'], path).toBe('no-referrer');
      expect(res.headers['x-powered-by'], path).toBeUndefined();
    }
  });

  it('관리자 응답은 캐시에 남기지 않는다 (인증 실패 응답 포함), 공개 응답은 그대로', async () => {
    expect((await request(app).get('/api/v1/admin/feedbacks')).headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/health')).headers['cache-control']).toBeUndefined();
  });
});

describe('JSON 본문', () => {
  it('깨진 JSON은 500이 아니라 400 COMMON_BAD_REQUEST', async () => {
    const res = await request(app).post('/api/v1/feedbacks').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMON_BAD_REQUEST');
  });
});

describe('에러 코드', () => {
  it('모두 {도메인}_{내용} 형식이고 HTTP 상태가 4xx·5xx다', () => {
    for (const [code, { status, message }] of Object.entries(ERROR_CODE)) {
      expect(code).toMatch(/^(COMMON|AUTH|FEEDBACK|EVENT|STATS)_[A-Z_]+$/);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe('API 문서 (Swagger)', () => {
  it('/api-docs.json에 모든 경로가 있다', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    const ops = Object.entries(res.body.paths as Record<string, object>).flatMap(([p, o]) =>
      Object.keys(o).map((m) => `${m.toUpperCase()} ${p}`),
    );
    expect(ops.sort()).toEqual(
      [
        'GET /health',
        'POST /api/v1/feedbacks',
        'POST /api/v1/events',
        'GET /api/v1/admin/feedbacks',
        'PATCH /api/v1/admin/feedbacks/{feedbackId}',
        'DELETE /api/v1/admin/feedbacks/{feedbackId}',
        'GET /api/v1/admin/stats/summary',
        'GET /api/v1/admin/stats/forms',
        'GET /api/v1/admin/stats/daily',
        'GET /api/v1/admin/stats/search',
        'GET /api/v1/admin/stats/fill',
        'GET /api/v1/admin/stats/export',
      ].sort(),
    );
  });

  it('관리자 경로에는 인증이 걸려 있고, 공개 경로에는 없다', async () => {
    const { body } = await request(app).get('/api-docs.json');
    for (const [p, ops] of Object.entries(body.paths as Record<string, Record<string, { security?: unknown[] }>>)) {
      for (const op of Object.values(ops)) {
        expect(Boolean(op.security?.length), p).toBe(p.startsWith('/api/v1/admin/'));
      }
    }
  });

  it('/api-docs 화면이 열린다', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
