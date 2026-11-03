# 코드 컨벤션

UMC 10기 Pebble 백엔드 컨벤션(노션 「Pebble Backend 코드 컨벤션 (최종)」, 2026-07-12)을 기준으로 맞췄다.
다른 점은 표 맨 아래 "Pebble과 다른 점"에 적었다.

## 1. 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| 파일 | kebab-case + 역할 | `feedback.service.ts`, `admin-auth.ts` |
| 변수·함수 | camelCase | `formKey`, `parseRange()` |
| 클래스·타입 | PascalCase | `AppError`, `DateRange` |
| 상수 | UPPER_SNAKE_CASE | `RATE_MAX`, `EVENT_TYPES` |
| DB 테이블·컬럼 | snake_case (`@@map`/`@map`) | `usage_event.form_key` |

## 2. 코드 스타일

TypeScript strict, 2칸, 작은따옴표, `const` 기본, async/await, `any` 금지, 함수 하나에 책임 하나.

## 3. 공통 응답 형식

```jsonc
// 성공
{ "success": true, "message": "피드백을 저장했습니다.", "data": { "id": "..." } }
// 목록
{ "success": true, "message": "...", "data": [ ... ], "page": { "offset": 0, "limit": 20, "total": 3 } }
// 실패
{ "success": false, "message": "입력값이 올바르지 않습니다.",
  "error": { "code": "COMMON_INVALID_INPUT", "details": [ { "path": "lang", "message": "..." } ] } }
```

- 응답은 반드시 `sendSuccess()` / `throw new AppError()`를 거친다. `res.json()`을 직접 조립하지 않는다 (CSV 내보내기와 `/api-docs.json`만 예외)
- 에러 코드는 `src/constants/error-code.ts`가 유일한 기준이다. 형식은 `{도메인}_{내용}` (`FEEDBACK_RATE_LIMITED`)
- `details`는 입력 검증 실패 때만 붙는다

## 4. API URL

- `/api/v1` 고정, 리소스 중심·복수형·kebab-case: `/api/v1/feedbacks`, `/api/v1/admin/stats/summary`
- 화면 이름(UI 명칭) 금지
- 예외: 상태 확인 `/health`, 문서 `/api-docs` (인프라용이라 버전을 붙이지 않음)

## 5. 폴더

```text
src/
├── app.ts · server.ts
├── config/        env · prisma · openapi
├── constants/     error-code · enums
├── middlewares/   error-handler · admin-auth · validate
├── utils/         response(sendSuccess, AppError) · ip-hash · date-range
└── domains/<도메인>/
    ├── <도메인>.route.ts        경로 + Swagger 등록
    ├── <도메인>.controller.ts   요청 → 서비스 → 응답 (DB 직접 접근 금지)
    ├── <도메인>.service.ts      규칙 (도배 제한 등)
    ├── <도메인>.repository.ts   Prisma·SQL
    └── <도메인>.schema.ts       zod 스키마 (검증 + Swagger 문서의 단일 출처)
```

## 6. 검증

zod 스키마 + `validateBody` / `validateQuery` / `validateParams` 미들웨어. 실패하면 `COMMON_INVALID_INPUT`.
같은 스키마로 Swagger 문서를 만든다(`@asteasolutions/zod-to-openapi`) → 검증과 문서가 따로 놀지 않는다.

## 7. 커밋

`접두사(도메인): 설명` — `feat` `fix` `refactor` `docs` `style` `test` `perf` `revert` `chore` `ci`
예: `feat(feedback): 칸 단위 신고 추가`, `fix(stats): 한국 시간 날짜 경계`

## 8. 금지

`console.log`(에러는 `console.error`, 서버 시작 안내만 `console.info`), 환경변수 하드코딩, `var`/`any`, 컨트롤러에서 DB 쿼리,
인증 없는 관리자 엔드포인트, 응답 json 직접 조립, URL에 화면 이름, **서식에 적는 값(이름·주민등록번호 등)을 받는 칸**

## 9. 브랜치·PR

`main` ← `<type>/<설명>` (예: `feat/phase1`). PR은 CI(타입 검사·테스트·이미지 빌드) 통과 후 머지.

## Pebble과 다른 점

| 항목 | Pebble | 구스링 | 이유 |
|---|---|---|---|
| Swagger 작성 | 라우트 JSDoc 주석 | zod 스키마에서 생성 | 검증과 문서가 늘 같음 |
| 브랜치 | `main → dev → <type>/#이슈` | `main ← <type>/<설명>` | 지금 백엔드 1인. 인원이 늘면 dev 도입 |
| 인증 | JWT(access·refresh) | 관리자 토큰 1개 | 1단계는 이용자 로그인 없음. 3단계에서 교체 |
| 상태 확인·문서 URL | `/api/v1` 아래 | `/health`, `/api-docs` | 인프라(Docker·Nginx 헬스체크)용 |
