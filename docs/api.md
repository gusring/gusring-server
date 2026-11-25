# API 명세

- 운영: `https://api.gusring.kro.kr` / 로컬: `http://localhost:4000` (이용자 사이트는 `https://gusring.kro.kr`, Vercel)
- 자세한 요청·응답 칸은 Swagger가 기준이다: `/api-docs` (화면), `/api-docs.json` (OpenAPI 3.1)
- 이 문서와 Swagger의 경로·에러 코드가 같은지는 `tests/api-doc.test.ts`가 확인한다
- 규칙은 [convention.md](convention.md), 테이블은 [erd.md](erd.md)

## 공통

```jsonc
// 성공
{ "success": true, "message": "피드백을 저장했습니다.", "data": { "id": "..." } }
// 목록 (offset·limit 쿼리, limit 기본 20 최대 100)
{ "success": true, "message": "피드백 목록입니다.", "data": [ ... ], "page": { "offset": 0, "limit": 20, "total": 3 } }
// 실패 (details는 입력 검증 실패 때만)
{ "success": false, "message": "입력값이 올바르지 않습니다.",
  "error": { "code": "COMMON_INVALID_INPUT", "details": [ { "path": "lang", "message": "..." } ] } }
```

- 관리자 API는 로그인 쿠키(관리자 화면 `/admin`) 또는 `Authorization: Bearer <ADMIN_TOKEN>`(스크립트용, 선택). 아래 "관리자 로그인" 참고
- 서식에 적는 값(이름·주민등록번호 등)은 받지 않는다. 정의되지 않은 칸이 섞이면 거부한다
- 통계 기간 `from`·`to`는 `YYYY-MM-DD` 한국 날짜, `to` 포함, 기본 최근 30일, 최대 366일

## 목록

| 메서드 | 경로 | 인증 | 설명 | 성공 |
|---|---|---|---|---|
| GET | `/health` | | 서버 상태 | 200 |
| POST | `/api/v1/feedbacks` | | 피드백 저장 | 201 `{ id }` |
| POST | `/api/v1/events` | | 이용 기록 묶음 저장 (최대 20개, text/plain도 받음) | 202 `{ accepted }` |
| POST | `/api/v1/auth/login` | | 관리자 로그인 `{ username, password }` → 쿠키 | 200 `{ username }` |
| POST | `/api/v1/auth/logout` | | 로그아웃 | 200 `null` |
| GET | `/api/v1/forms` | | 공개한 서식 목록 (번호순) | 200 `[{ key, formNo, category, title, desc, version }]` |
| GET | `/api/v1/forms/{key}` | | 공개한 서식 정의 (`pages[].image` = 이미지 주소) | 200 `{ key, formNo, version, definition }` |
| GET | `/api/v1/form-images/{id}` | | 서식 쪽 이미지 PNG (1년 캐시, CORS, 공통 형식으로 감싸지 않음) | 200 PNG |
| GET | `/api/v1/auth/me` | 관리자 | 지금 로그인한 관리자 | 200 `{ username }` |
| POST | `/api/v1/auth/password` | 관리자(로그인) | 내 비밀번호 바꾸기 `{ currentPassword, newPassword }` | 200 `null` |
| GET | `/api/v1/admin/users` | 계정 관리자 | 관리자 계정 목록 | 200 |
| POST | `/api/v1/admin/users` | 계정 관리자 | 계정 만들기 `{ username, role, temporaryPassword }` | 201 `{ username }` |
| PATCH | `/api/v1/admin/users/{username}` | 계정 관리자 | 역할 바꾸기·막기·풀기 `{ role?, disabled? }` | 200 `null` |
| POST | `/api/v1/admin/users/{username}/password` | 계정 관리자 | 비밀번호 초기화 `{ temporaryPassword }` | 200 `null` |
| POST | `/api/v1/admin/users/{username}/unlock` | 계정 관리자 | 5번 실패 잠금 풀기 | 200 `null` |
| GET | `/api/v1/admin/audit-logs` | 관리자 | 관리 기록 (최신순, `actor` `action` `offset` `limit`) | 200 + `page` |
| GET | `/api/v1/admin/forms` | 관리자 | 서식 목록 (지운 것 제외) | 200 |
| POST | `/api/v1/admin/forms` | 관리자 | 서식 만들기 `{ key, formNo, definition? }` 또는 `{ key, formNo, copyFrom }` | 201 서식 |
| GET | `/api/v1/admin/forms/{id}` | 관리자 | 초안과 정보 | 200 서식 |
| PATCH | `/api/v1/admin/forms/{id}` | 관리자 | 초안 저장 `{ definition, key?, formNo?, baseUpdatedAt }` | 200 서식 |
| DELETE | `/api/v1/admin/forms/{id}` | 계정 관리자 | 지우기 (이용자에게서 내림, 판은 남김) | 200 `null` |
| POST | `/api/v1/admin/forms/{id}/publish` | 계정 관리자 | 전체 검사 후 새 판으로 공개 `{ baseUpdatedAt? }` | 200 서식 |
| GET | `/api/v1/admin/forms/{id}/versions` | 관리자 | 공개한 판 목록 (최신순) | 200 |
| POST | `/api/v1/admin/forms/{id}/versions/{version}/restore` | 관리자 | 그 판을 초안으로 되돌리기 | 200 서식 |
| POST | `/api/v1/admin/form-images` | 관리자 | 쪽 이미지 올리기 (본문 PNG 그대로, `Content-Type: image/png`, 4MB) | 201 `{ id, width, height }` |
| GET | `/api/v1/admin/feedbacks` | 관리자 | 피드백 목록 (최신순, `status` `lang` `formKey` `offset` `limit`) | 200 + `page` |
| PATCH | `/api/v1/admin/feedbacks/{feedbackId}` | 관리자 | 처리 상태 변경 `{ status }` | 200 피드백 |
| DELETE | `/api/v1/admin/feedbacks/{feedbackId}` | 관리자 | 삭제 (본문에 개인정보가 있을 때) | 200 `null` |
| GET | `/api/v1/admin/stats/summary` | 관리자 | 방문자·조회·다운로드·작성 단계, 언어별 방문자 | 200 |
| GET | `/api/v1/admin/stats/forms` | 관리자 | 서식별 조회·다운로드 (`lang`으로 거름) | 200 |
| GET | `/api/v1/admin/stats/daily` | 관리자 | 날짜별 방문자·조회·다운로드 (빈 날 0) | 200 |
| GET | `/api/v1/admin/stats/search` | 관리자 | 많이 찾은 검색어, 결과 0건 검색어 (각 20개) | 200 |
| GET | `/api/v1/admin/stats/fill` | 관리자 | 작성 도우미 단계별 수, 안내를 많이 연 칸 | 200 |
| GET | `/api/v1/admin/stats/export` | 관리자 | 서식 × 언어 CSV (BOM, 공통 형식으로 감싸지 않음) | 200 CSV |

## 요청 예

```jsonc
// POST /api/v1/feedbacks
{ "lang": "ja", "formKey": "birth-report", "fieldId": "childNameKo", "type": "guide", "message": "..." }
// type: general(기본) · translation · guide · bug
// website: 봇을 거르는 숨은 칸. 채워져 있으면 201로 답하고 저장하지 않는다 (data.id = null)

// POST /api/v1/events
{ "visitorId": "<브라우저에 저장한 uuid>",
  "events": [ { "type": "form_view", "lang": "vi", "formNo": 4 },
              { "type": "search", "lang": "vi", "searchTerm": "khai sinh", "resultCount": 0 } ] }
```

이벤트 종류별 필수 칸:

| 종류 | 필수 |
|---|---|
| `form_view` `form_download` `detail_time` `fill_start` `field_open` `fill_preview` `fill_png_save` `fill_print` `fill_reset` | `formKey` 또는 `formNo` |
| `field_open` | `fieldId` |
| `search` | `searchTerm` (결과 수는 `resultCount`) |
| `detail_time` | `durationSec` (0~3600) |
| `landing_view` `list_view` `language_select` `category_filter` `feedback_click` | 없음 |

## 에러 코드

기준은 `src/constants/error-code.ts`. 형식 `{도메인}_{내용}`.

| 코드 | HTTP | 언제 |
|---|---|---|
| `COMMON_INVALID_INPUT` | 400 | 입력 검증 실패. `details`에 칸과 이유 |
| `COMMON_BAD_REQUEST` | 400 | 본문을 JSON으로 읽을 수 없음 |
| `COMMON_NOT_FOUND` | 404 | 없는 경로 |
| `COMMON_PAYLOAD_TOO_LARGE` | 413 | 본문이 100KB(이벤트 text/plain은 64KB, 서식 정의 1MB, 서식 이미지 4MB)를 넘음 |
| `COMMON_TOO_MANY_REQUESTS` | 429 | Nginx 속도 제한 (이벤트 분당 60·순간 40, 피드백 분당 10·순간 5, 공개 서식·이미지 분당 120·순간 60) |
| `COMMON_INTERNAL_ERROR` | 500 | 서버 오류. 내부 정보는 응답에 넣지 않고 서버 로그에만 |
| `COMMON_NOT_READY` | 503 | Nginx: HTTPS 인증서 발급 전 |
| `AUTH_ADMIN_REQUIRED` | 401 | 로그인하지 않았거나 세션이 끝남, 토큰이 틀림 |
| `AUTH_INVALID_CREDENTIALS` | 401 | 아이디 또는 비밀번호가 틀림 (어느 쪽인지 알려 주지 않음) |
| `AUTH_LOGIN_LOCKED` | 429 | 같은 계정 5번 연속 실패로 15분 잠김 |
| `AUTH_WRONG_PASSWORD` | 400 | 비밀번호 바꾸기에서 지금 비밀번호가 틀림 (로그인 실패와 같이 세어 5번이면 잠금) |
| `AUTH_FORBIDDEN` | 403 | 계정 관리자만 할 수 있는 일 (일반 관리자·스크립트 토큰) |
| `AUTH_PASSWORD_CHANGE_REQUIRED` | 403 | 임시 비밀번호로 들어옴. 비밀번호를 바꾸기 전에는 `/api/v1/admin/*` 불가 |
| `USER_NOT_FOUND` | 404 | 없는 관리자 계정 |
| `USER_ALREADY_EXISTS` | 409 | 이미 있는 아이디 |
| `USER_LAST_MANAGER` | 409 | 계정 관리자가 한 명도 안 남게 되는 변경 |
| `USER_SELF_CHANGE` | 409 | 자기 계정을 막거나 역할을 바꾸거나 초기화하려 함 |
| `AUTH_BAD_ORIGIN` | 403 | 로그인·로그아웃, 또는 쿠키로 바꾸는 요청(PATCH·DELETE)이 다른 출처에서 옴 |
| `FEEDBACK_RATE_LIMITED` | 429 | 같은 사람(IP 해시) 10분에 5건 초과 |
| `FEEDBACK_NOT_FOUND` | 404 | 없는 피드백 id |
| `FORM_NOT_FOUND` | 404 | 없는(지운) 서식·공개하지 않은 서식(공개 API)·없는 판 |
| `FORM_KEY_TAKEN` | 409 | 이미 쓰는 서식 key (지운 서식 포함) |
| `FORM_NO_TAKEN` | 409 | 이미 쓰는 서식 번호 (지운 서식 포함) |
| `FORM_CONFLICT` | 409 | 초안을 불러온 뒤 다른 관리자가 먼저 저장함 (`baseUpdatedAt`이 다름). 다시 불러와야 한다 |
| `FORM_INVALID` | 422 | 공개 전 검사 실패. `details`에 `{ path, message }` 목록 (예: `fields[3].label.en`) |
| `FORM_IMAGE_INVALID` | 400 | PNG가 아님·잘린 파일·`Content-Type`이 `image/png`가 아님 |
| `FORM_IMAGE_NOT_FOUND` | 404 | 없는 서식 이미지 |
| `STATS_INVALID_RANGE` | 400 | 기간 형식이 틀림·없는 날짜·from이 늦음·366일 초과 |

## 관리자 로그인

- 가입 화면은 없다. 역할은 계정 관리자(`manager`)와 일반 관리자(`staff`). 계정 관리자가 `/api/v1/admin/users`로 만들고 관리한다
- 첫 계정은 NAS 명령으로 만든다(계정 관리자): `docker compose exec app node dist/cli/admin-user.js create <아이디>`
- 계정 관리자가 만들거나 초기화한 계정은 임시 비밀번호(`mustChangePassword`). 바꾸기 전에는 `/api/v1/admin/*`가 `AUTH_PASSWORD_CHANGE_REQUIRED`
- 계정 관리자가 한 명도 안 남게 되는 변경은 `USER_LAST_MANAGER`. 동시에 와도 DB 잠금으로 한 번에 하나씩 처리한다
- 스크립트용 토큰은 일반 관리자와 같다 (계정 관리 불가)
- 비밀번호는 scrypt 해시로만 저장. 세션 쿠키 값도 DB에는 SHA-256 해시만
- 쿠키 `gusring_admin`: HttpOnly, SameSite=Strict, Path=/api/v1, 운영은 Secure. 2시간 안 쓰거나 로그인 12시간 뒤 끝남
- 같은 계정 5번 연속 실패 → 15분 잠금. Nginx에서 로그인 요청 IP당 분당 10번(순간 5)
- 쿠키로 들어온 POST·PATCH·DELETE와 로그인·로그아웃은 Origin이 서버와 같아야 한다 (다른 사이트가 몰래 보내는 요청 방지)
- 계정 막기·비밀번호 바꾸기는 그 계정의 로그인을 바로 끊는다. 관리자 화면에서 스스로 바꾸면 지금 로그인만 남긴다
- 비밀번호 바꾸기(`/api/v1/auth/password`)는 지금 비밀번호를 확인한다. 틀리면 로그인 실패와 같이 세어 5번이면 15분 잠금
- 관리 기록(`admin_audit_log`): 로그인·실패·로그아웃·피드백 상태 변경·삭제·계정 관리·서식. 피드백 본문은 남기지 않는다

## 서식 정의

- 서식 정의(작성 도우미의 칸 좌표·5개 국어 안내)를 DB에 둔다. 관리자는 초안(`form.draft`)을 고치고, 계정 관리자가 공개하면 새 판(`form_version`)이 쌓인다. 이용자 API는 공개한 판만 내준다
- 정의 모양은 gusring-web-v2 `src/forms/types.ts` 기준 (`src/domains/form/form.schema.ts`의 `formDefinition`): `{ title, desc, category, preset?, pages: [{ imageId, width, height, marginX? }], sections, fields }`. 모르는 칸이 섞이면 400
- 초안 저장은 모양만 검사한다(번역이 비어도 저장). 공개할 때 `form-validate.ts`가 내용을 검사한다: 칸 id 중복·형식, 없는 섹션, 5개 국어, 쪽 순서, 좌표가 쪽 안인지, 쪽 크기 = 이미지 크기, 선택지 value, `extra.when`·`copyFrom`·`preset`이 가리키는 것. 규칙 원본은 gusring-web-v2 (같이 고친다)
- 동시에 고치기: 불러올 때 받은 `draftUpdatedAt`을 저장할 때 `baseUpdatedAt`으로 보낸다. 그새 다른 사람이 저장했으면 `FORM_CONFLICT`
- 이용자에게 내줄 때 `pages[].imageId`는 `pages[].image`(`/api/v1/form-images/{id}`)로 바뀐다. 이미지 id는 내용의 SHA-256이라 1년 캐시(`immutable`)해도 된다. 이미지도 DB(`form_image`)에 있어 매일 백업에 같이 들어간다
- 이용자 사이트가 이미지를 캔버스로 PNG 저장하려면 그 주소가 NAS `.env`의 `CORS_ORIGIN`에 있어야 한다 (`https://gusring.kro.kr`)
- 처음 옮기기: `npm run forms:import <폴더>` (NAS: `docker compose cp <폴더> app:/tmp/forms` 후 `docker compose exec app node dist/cli/forms-import.js /tmp/forms`). 폴더에 `forms.json`(`[{ key, formNo, definition }]`, `pages[].image`는 PNG 파일 이름)과 PNG. 같은 key는 건너뛴다
- 관리 화면은 `/admin/forms/` (gusring-web-v2에서 빌드해 `public/admin/forms/`에 넣는다. 화면 안 경로는 `index.html`로)
- 관리 기록: `form.create` `form.update` `form.publish` `form.delete` `form.restore` `form_image.upload`

## 바뀐 것

| 날짜 | 내용 |
|---|---|
| 2026-11-25 | 서식 정의를 DB로: 공개 `/api/v1/forms`·`/api/v1/form-images`, 관리 `/api/v1/admin/forms`·`/api/v1/admin/form-images`, 초안 → 공개(계정 관리자만), 판 되돌리기, `FORM_*` 에러 코드, 서식 관리 화면 `/admin/forms/` |
| 2026-11-10 | 계정 관리자·일반 관리자 역할, 관리자 화면에서 계정 관리(`/api/v1/admin/users`), 임시 비밀번호. 주소를 `api.gusring.kro.kr`로 |
| 2026-11-05 | 관리자 화면에서 내 비밀번호 바꾸기 (`POST /api/v1/auth/password`, `AUTH_WRONG_PASSWORD`) |
| 2026-11-04 | 관리자 아이디·비밀번호 로그인(쿠키 세션), 관리 기록, `ADMIN_TOKEN`은 스크립트용 선택으로. `AUTH_ADMIN_DISABLED` 없앰 |
| 2026-11-03 | 공통 응답 형식, `/api/v1` 아래로 이동, 에러 코드 `{도메인}_{내용}`, 목록 `page` → `offset`·`limit`, 삭제 204 → 200, CSV `export.csv` → `export`, Swagger 추가 |
