# gusring-server

구스링 백엔드 (Express + TypeScript + Prisma + PostgreSQL)

1단계: 피드백 저장 + 이용 통계. 설계는 [docs/phase1-design.md](docs/phase1-design.md), 근거가 된 기능 명세는 [docs/feature-spec.md](docs/feature-spec.md).

## 실행

Node.js 22 이상, Docker가 필요합니다.

```bash
npm install            # Prisma 클라이언트도 같이 생성됨
cp .env.example .env   # ADMIN_TOKEN, IP_HASH_SECRET 채우기
npm run db:up          # 로컬 PostgreSQL (localhost:5433)
npm run db:deploy      # 테이블 만들기
npm run dev            # http://localhost:4000
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (파일 저장 시 자동 재시작) |
| `npm run build` | Prisma 클라이언트 생성 + `dist/`로 빌드 |
| `npm start` | 빌드한 서버 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 테스트 (Docker의 `gusring_test` DB에서, 매 테스트 전 비움) |
| `npm run db:up` | 로컬 DB 띄우기 |
| `npm run db:migrate` | 스키마를 바꾼 뒤 마이그레이션 만들기 |
| `npm run db:deploy` | 마이그레이션 적용 (배포 DB 포함) |

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `PORT` | | 기본 4000 |
| `CORS_ORIGIN` | | 허용할 프론트 주소 (쉼표로 구분) |
| `TRUST_PROXY` | | 앞단 프록시 개수. 로컬 0, Vercel 1 |
| `DATABASE_URL` | O | PostgreSQL 주소 |
| `ADMIN_TOKEN` | O | 관리자 API 토큰. 없으면 관리자 API가 503 |
| `IP_HASH_SECRET` | O | IP 해시에 섞는 비밀값 |

`.env`는 git에 올라가지 않습니다. 새 변수를 추가하면 `.env.example`에도 적어 주세요.

## API

에러는 모두 `{ "error": { "code", "message", "details"? } }` 형식입니다. 입력값이 틀리면 `details`에 어느 칸이 왜 틀렸는지 나옵니다.

### 공개

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 |
| POST | `/feedback` | 피드백 저장 → `201 { id }` |
| POST | `/events` | 이용 이벤트 묶음 저장 (최대 20개) → `202 { accepted }`. `text/plain`(sendBeacon)도 받음 |

```jsonc
// POST /feedback
{ "lang": "ja", "formKey": "birth-report", "fieldId": "childNameKo", "type": "guide", "message": "..." }

// POST /events
{ "visitorId": "<브라우저에 저장한 uuid>",
  "events": [ { "type": "form_view", "lang": "vi", "formNo": 4 },
              { "type": "search", "lang": "vi", "searchTerm": "khai sinh", "resultCount": 0 } ] }
```

### 관리자 (`Authorization: Bearer <ADMIN_TOKEN>`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/feedback?status=&lang=&formKey=&page=` | 피드백 목록 (최신순 20개씩) |
| PATCH | `/admin/feedback/:id` | `{ "status": "read" }` 처리 상태 변경 |
| DELETE | `/admin/feedback/:id` | 삭제 (본문에 개인정보가 적혀 있을 때) |
| GET | `/admin/stats/summary` | 방문자·조회·다운로드·작성 수, 언어별 방문자 |
| GET | `/admin/stats/forms?lang=` | 서식별 조회·다운로드 |
| GET | `/admin/stats/daily` | 날짜별 (빈 날 0) |
| GET | `/admin/stats/search` | 많이 찾은 검색어, 결과 0건 검색어 |
| GET | `/admin/stats/fill` | 작성 도우미: 서식별 시작·완성·출력, 안내를 많이 연 칸 |
| GET | `/admin/stats/export.csv` | 서식 × 언어별 표 (엑셀용) |

통계는 모두 `?from=YYYY-MM-DD&to=YYYY-MM-DD` (한국 시간, `to` 포함, 기본 최근 30일, 최대 366일).

## 개인정보

- 서식에 적는 값(이름·주민등록번호·주소)은 받지 않습니다. 이벤트에 정의되지 않은 칸이 섞이면 통째로 거부합니다
- 원래 IP는 저장하지 않고, 도배 제한용 해시(HMAC-SHA256)만 남깁니다. 관리자 응답에도 내보내지 않습니다
- `visitorId`는 브라우저가 만든 무작위 값입니다

## 구조

```text
src/
├── app.ts                  # 앱 구성 (미들웨어·라우터 연결)
├── server.ts               # 서버 실행
├── db.ts                   # Prisma 클라이언트 (처음 쓸 때 연결)
├── config/env.ts           # 환경변수
├── routes/                 # health · feedback · events · admin-feedback · admin-stats
├── middlewares/            # error-handler · admin-auth
├── lib/                    # 입력 검증 · 공통 스키마 · IP 해시 · 기간(한국 시간)
└── generated/prisma/       # Prisma 생성 코드 (git 제외)
prisma/                     # schema.prisma · migrations
tests/                      # 실제 DB에 붙인 테스트
docker-compose.yml          # 개발·테스트 DB
```
