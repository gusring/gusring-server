# 1단계 설계 — 피드백 저장 + 이용 통계

상태: 구현 중 (2026-11-01). 근거 기능 명세는 [feature-spec.md](feature-spec.md).
10-23 첫 안에서 바뀐 것: 서식 식별자를 문자열 `form_key`로, `field_id`·작성 도우미 이벤트·`result_count`·`/admin/stats/fill` 추가.

## 범위

| 포함 | 제외 (다음 단계) |
|---|---|
| 피드백 저장 (서식·칸 단위 포함) | 관리자 로그인 화면 (1단계는 관리자 토큰) |
| 이용 이벤트 저장 (gusring-web GA4 이벤트 + 작성 도우미 이벤트) | 서식 데이터 DB 이전, 이미지 업로드 |
| 관리자용 피드백 조회·상태 변경 | 번역 오류 신고 화면 (테이블은 대비) |
| 관리자용 통계 + CSV (기관 보고용) | 데이터 자동 삭제 (보관 기간 미정) |

## 기술

| 항목 | 선택 | 이유 |
|---|---|---|
| DB | PostgreSQL. 개발·테스트는 Docker, 배포는 Supabase(무료) | 이 규모에 무료 플랜으로 충분 |
| ORM | Prisma 7 (`@prisma/adapter-pg`) | 스키마 파일 하나로 테이블·마이그레이션·타입 |
| 입력 검증 | Zod | 요청 검증 + 타입 |
| 관리자 인증 | `Authorization: Bearer <ADMIN_TOKEN>` | 1단계는 단순하게. 3단계에 로그인으로 교체 |
| 배포 | Vercel 별도 프로젝트 (Express 함수) | 프론트와 같은 무료 플랜 |

## DB

| enum | 값 |
|---|---|
| `lang` | `ko` `en` `zh` `ja` `vi` |
| `feedback_type` | `general` 일반 의견 · `translation` 번역 오류 · `guide` 칸 안내 오류 · `bug` 사이트 오류 |
| `feedback_status` | `new` → `read` → `resolved` |
| `event_type` | gusring-web: `landing_view` `list_view` `form_view` `form_download` `language_select` `search` `category_filter` `feedback_click` `detail_time` / 작성 도우미: `fill_start` `field_open` `fill_preview` `fill_png_save` `fill_print` `fill_reset` |

### feedback

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| lang | lang | 화면 언어 |
| form_key | text? | 서식 식별자 (예: `birth-report`) |
| form_no | smallint? | gusring-web 서식 번호 (1~41) |
| field_id | text? | 작성 도우미 칸 id (예: `childNameKo`) |
| type | feedback_type | 기본 `general` |
| message | text | 1~2000자 |
| status | feedback_status | 기본 `new` |
| ip_hash | char(64)? | 도배 막기용. 원래 IP는 저장 안 함 (HMAC-SHA256 + 서버 비밀값) |
| created_at / updated_at | timestamptz | |

### usage_event

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigint PK | |
| type | event_type | |
| lang | lang? | |
| form_key / form_no / field_id | | 위와 같음 |
| category | text? | 분류 필터 |
| search_term | text? | 최대 100자 |
| result_count | int? | 검색 결과 수 (0건 검색어 찾기) |
| duration_sec | int? | 상세 체류 시간 0~3600 |
| visitor_id | uuid | 브라우저에 둔 무작위 값. 사람을 특정할 수 없음 |
| created_at | timestamptz | |

## API

11-03부터 [api.md](api.md)로 옮겼다 (`/api/v1` 아래, 공통 응답 형식, 에러 코드 `{도메인}_{내용}`). 테이블은 [erd.md](erd.md).
`formKey`는 영문 소문자·숫자·하이픈 1~64자, `formNo`는 1~999.

## 원칙

- 서식에 적는 값(이름·주민등록번호·주소)은 서버로 받지 않는다. 이벤트에는 서식·칸 식별자와 언어만
- 이름·연락처·원래 IP를 저장하지 않는다
- GA4는 유지하고 병행 전송

## 남은 결정

1. v2 방향, 피드백·분석 유지 여부, 공통 서식 식별자 → 팀(miniminimo님)과
2. 데이터 보관 기간 → 정해지면 자동 삭제 작업 추가
