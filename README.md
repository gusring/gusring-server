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

명세: [docs/api.md](docs/api.md) · Swagger `/api-docs` (운영 https://gusring.kro.kr/api-docs) · ERD [docs/erd.md](docs/erd.md) · 규칙 [docs/convention.md](docs/convention.md)

```jsonc
// 성공
{ "success": true, "message": "피드백을 저장했습니다.", "data": { "id": "..." } }
// 실패 (코드는 {도메인}_{내용})
{ "success": false, "message": "입력값이 올바르지 않습니다.", "error": { "code": "COMMON_INVALID_INPUT", "details": [ ... ] } }
```

| 구분 | 경로 |
|---|---|
| 공개 | `POST /api/v1/feedbacks`, `POST /api/v1/events` |
| 관리자 (`Authorization: Bearer <ADMIN_TOKEN>`) | `/api/v1/admin/feedbacks`, `/api/v1/admin/stats/{summary,forms,daily,search,fill,export}` |
| 버전 없음 | `GET /health`, `/api-docs`, `/api-docs.json` |

## 개인정보

- 서식에 적는 값(이름·주민등록번호·주소)은 받지 않습니다. 이벤트에 정의되지 않은 칸이 섞이면 통째로 거부합니다
- 원래 IP는 저장하지 않고, 도배 제한용 해시(HMAC-SHA256)만 남깁니다. 관리자 응답에도 내보내지 않습니다
- `visitorId`는 브라우저가 만든 무작위 값입니다

## 구조

```text
src/
├── app.ts · server.ts      # 앱 구성 / 서버 실행
├── config/                 # env · prisma(클라이언트) · openapi(Swagger) · zod
├── constants/              # error-code(에러 코드 기준) · enums
├── middlewares/            # error-handler · admin-auth · validate
├── utils/                  # response(sendSuccess·AppError) · common-schema · ip-hash · date-range
├── domains/                # health · feedback · event · stats
│   └── <도메인>/           #   route · controller · service · repository · schema
└── generated/prisma/       # Prisma 생성 코드 (git 제외)
prisma/                     # schema.prisma · migrations
tests/                      # 실제 DB에 붙인 테스트
deploy/nas/                 # NAS 배포 (Nginx·인증서·백업) — deploy/nas/README.md
docker-compose.yml          # 개발·테스트 DB
```
