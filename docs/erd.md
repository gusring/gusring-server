# ERD

기준: `prisma/schema.prisma` (마이그레이션 `20261101082752_init`). 스키마를 바꾸면 이 문서도 같이 바꾼다.

이용자 쪽 테이블 2개(`feedback`, `usage_event`)는 서로 관계(외래 키)가 없다.
관리자 쪽 3개(`admin_user`, `admin_session`, `admin_audit_log`, 2026-11-04 추가)는 이용자 쪽과 이어지지 않는다. `admin_session`만 `admin_user`를 가리키고(계정을 지우면 세션도 지움), 관리 기록은 계정이 지워져도 남도록 아이디를 글자로 적는다.
피드백과 이용 기록은 사람을 이어 붙이지 않으려고 일부러 따로 둔다 (피드백의 `ip_hash`와 이용 기록의 `visitor_id`는 같은 사람이어도 연결할 수 없다).
글자 수·범위 제한은 DB가 아니라 API 검사(zod)에서 건다. 아래 그림의 "1~2000자" 같은 표시는 API 기준이다.
서식(`form_key`·`form_no`)은 아직 DB에 서식 테이블이 없어 문자열·번호로만 적는다. 서식 데이터를 서버로 옮기는 단계에서 `form` 테이블과 관계를 만든다.

```mermaid
erDiagram
    feedback {
        uuid        id          PK "서버(Prisma)가 만든 uuid"
        lang        lang           "화면 언어"
        text        form_key       "NULL 가능. 작성 도우미 서식 (예: birth-report)"
        smallint    form_no        "NULL 가능. gusring-web 서식 번호"
        text        field_id       "NULL 가능. 작성 도우미 칸 (예: childNameKo)"
        feedback_type type         "기본 general"
        text        message        "1~2000자, 앞뒤 공백 제거"
        feedback_status status     "기본 new"
        char64      ip_hash        "NULL 가능. HMAC-SHA256(IP). 원래 IP는 저장 안 함"
        timestamptz created_at
        timestamptz updated_at
    }

    usage_event {
        bigint      id          PK "자동 증가 (BIGSERIAL)"
        event_type  type
        lang        lang           "NULL 가능"
        text        form_key       "NULL 가능"
        smallint    form_no        "NULL 가능"
        text        field_id       "NULL 가능. field_open에서 필수"
        text        category       "NULL 가능. 1~32자"
        text        search_term    "NULL 가능. search에서 필수, 1~100자"
        int         result_count   "NULL 가능. 검색 결과 수 0~10000"
        int         duration_sec   "NULL 가능. detail_time에서 필수, 0~3600"
        uuid        visitor_id     "브라우저에 저장한 무작위 값"
        timestamptz created_at
    }

    admin_user ||--o{ admin_session : "로그인"
    admin_user {
        uuid        id            PK
        text        username      UK "영문 소문자로 시작 3~32자"
        text        password_hash    "scrypt$N$r$p$salt$hash (원래 비밀번호 저장 안 함)"
        admin_role  role             "manager 계정 관리자 · staff 일반 관리자"
        boolean     must_change_password "임시 비밀번호면 true"
        boolean     disabled         "막힌 계정"
        smallint    failed_count     "연속 실패 수"
        timestamptz locked_until     "NULL 가능. 5번 실패 시 15분"
        timestamptz last_login_at    "NULL 가능"
        timestamptz created_at
        timestamptz updated_at
    }
    admin_session {
        char64      id            PK "쿠키 값의 SHA-256 (쿠키 값 자체는 저장 안 함)"
        uuid        user_id       FK "admin_user.id, 계정 삭제 시 같이 삭제"
        timestamptz created_at
        timestamptz last_seen_at     "2시간 안 쓰면 만료"
        timestamptz expires_at       "로그인 12시간 뒤"
    }
    admin_audit_log {
        bigint      id            PK
        text        actor            "관리자 아이디 · token · cli"
        text        action           "login · login_failed · logout · password_failed · feedback.status · feedback.delete · user.*"
        text        target           "NULL 가능. 피드백 id·계정 아이디"
        jsonb       detail           "NULL 가능. 피드백 본문은 넣지 않음"
        timestamptz created_at
    }
```

## enum

| 이름 | 값 |
| --- | --- |
| `lang` | `ko` `en` `zh` `ja` `vi` |
| `feedback_type` | `general` 일반, `translation` 번역, `guide` 안내 내용, `bug` 오류 |
| `feedback_status` | `new` 새 글, `read` 읽음, `resolved` 처리함 |
| `admin_role` | `manager` 계정 관리자, `staff` 일반 관리자 |
| `event_type` | gusring-web: `landing_view` `list_view` `form_view` `form_download` `language_select` `search` `category_filter` `feedback_click` `detail_time`<br>작성 도우미: `fill_start` `field_open` `fill_preview` `fill_png_save` `fill_print` `fill_reset` |

같은 값이 `src/constants/enums.ts`에도 있다. 하나를 바꾸면 둘 다 바꾼다.

## 인덱스

| 테이블 | 인덱스 | 쓰는 곳 |
| --- | --- | --- |
| feedback | `(status, created_at DESC)` | 관리자 피드백 목록 (상태로 거르고 최신순) |
| feedback | `(form_key)` | 서식으로 거르기 |
| feedback | `(ip_hash, created_at)` | 같은 사람 10분 5건 제한 |
| usage_event | `(type, created_at)` | 통계 대부분 (종류 + 기간) |
| usage_event | `(form_key, type)` | 서식별 통계 |
| usage_event | `(created_at)` | 기간 전체 합계, 날짜별 |

## 받지 않는 값

서식에 적는 값(이름·주민등록번호·주소 등)은 어느 테이블에도 칸이 없다.
API도 정의되지 않은 칸이 섞인 이벤트는 묶음 전체를 거부한다 (`tests/events.test.ts`).

## 그림 도구

ERD Cloud 등에 올릴 때는 `prisma/migrations/*/migration.sql`을 가져오기(import)하면 같은 그림이 나온다.
