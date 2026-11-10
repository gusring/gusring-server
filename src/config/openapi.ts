import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { errorResponse } from '../utils/common-schema.js';

// 각 도메인의 *.route.ts가 여기에 경로를 등록하고, /api-docs가 이걸로 문서를 만든다.
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'adminSession', {
  type: 'apiKey',
  in: 'cookie',
  name: 'gusring_admin',
  description: '관리자 로그인 쿠키 (POST /api/v1/auth/login). 바꾸는 요청(PATCH·DELETE)은 같은 출처(Origin)에서만',
});
registry.registerComponent('securitySchemes', 'adminToken', {
  type: 'http',
  scheme: 'bearer',
  description: '스크립트용 관리자 토큰 (NAS .env의 ADMIN_TOKEN, 선택)',
});

/** 관리자 경로: 로그인 쿠키 또는 토큰 */
export const adminSecurity: Record<string, string[]>[] = [{ adminSession: [] }, { adminToken: [] }];

/** 실패 응답 문서. codes는 그 경로에서 날 수 있는 에러 코드 */
export function errors(list: Record<number, string>) {
  return Object.fromEntries(
    Object.entries(list).map(([status, codes]) => [
      status,
      { description: codes, content: { 'application/json': { schema: errorResponse } } },
    ]),
  );
}

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: '구스링 API',
      version: '1.0.0',
      description: [
        '거주 외국인 행정 서식 안내 서비스 구스링의 백엔드.',
        '',
        '- 성공: `{ success: true, message, data }` / 목록은 `page: { offset, limit, total }` 추가',
        '- 실패: `{ success: false, message, error: { code, details? } }`. 코드는 `{도메인}_{내용}`',
        '- 서식에 적는 값(이름·주민등록번호 등)은 받지 않는다. 정의되지 않은 칸이 섞이면 거부',
      ].join('\n'),
    },
    servers: [{ url: 'https://api.gusring.kro.kr', description: '운영 (NAS)' }, { url: 'http://localhost:4000', description: '로컬' }],
  });
}
