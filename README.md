# gusring-server

구스링 백엔드 (Express + TypeScript)

## 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
cp .env.example .env   # 필요하면 값 수정
npm run dev            # http://localhost:4000 (파일 저장 시 자동 재시작)
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (tsx watch) |
| `npm run build` | `dist/`로 빌드 |
| `npm start` | 빌드한 서버 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 테스트 (Vitest + Supertest) |

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `4000` | 서버 포트 |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:5173` | 허용할 프론트 주소 (쉼표로 구분) |

`.env`는 git에 올라가지 않습니다. 새 변수를 추가하면 `.env.example`에도 적어 주세요.

## 구조

```text
src/
├── app.ts                    # 앱 구성 (미들웨어·라우터 연결)
├── server.ts                 # 서버 실행 (listen)
├── config/env.ts             # 환경변수 읽기
├── routes/                   # 라우터 (경로별)
│   └── health.ts             # GET /health
└── middlewares/
    └── error-handler.ts      # 404·에러 응답 형식
tests/                        # 테스트
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 확인 → `{ "status": "ok", "uptime": 12 }` |

에러 응답은 모두 같은 형식입니다.

```json
{ "error": { "code": "NOT_FOUND", "message": "GET /forms 경로가 없습니다." } }
```
