# NAS 배포 (QNAP, Container Station)

구스링 전용 묶음이다. 다른 프로젝트(TIMIROOM·naco 등)와 컨테이너·네트워크·볼륨·DB를 공유하지 않는다.

| 항목 | 값 |
|---|---|
| 폴더 | `/share/Container/gusring` |
| 공인 IP | `223.194.166.7` (QNAP 고정 IP 네트워크 `qnet-static-bond0-272384`에 Nginx만 붙음) |
| 도메인 | `gusring.kro.kr` (내도메인.한국, A 레코드 → 공인 IP) |
| 인증서 | ZeroSSL (kro.kr은 Let's Encrypt 발급 한도에 자주 걸림) |

```text
인터넷 ── 223.194.166.7:80/443 ── nginx ──(internal)── app:4000 ──(internal)── db:5432
                                    certbot ──(egress)── ZeroSSL
```

- 서버·DB는 외부 포트가 없어 밖에서 직접 닿지 않는다. 들어오는 길은 Nginx(공인 IP) 하나
- QNAP은 `internal: true`(인터넷 차단) 네트워크를 만들지 못한다(NAT 규칙 추가 실패). 그래서 일반 bridge를 쓴다
- 모르는 주소(IP 직접 접속, 다른 도메인)는 Nginx가 응답 없이 끊는다
- 같은 IP 요청 제한: `/api/v1/events` 분당 60(순간 40), `/api/v1/feedbacks` 분당 10(순간 5). 경로 대소문자·끝 `/`가 달라도 같이 제한. 서버 쪽 피드백 10분 5건 제한과 별개
- Nginx가 본 접속 IP 하나만 서버에 넘긴다(`X-Forwarded-For` 덮어씀) → 헤더 위조로 제한을 피할 수 없다

## 처음 올리기

로컬(이 저장소):

```bash
TAG=$(git rev-parse --short HEAD)
docker build --target runtime -t gusring-server:$TAG .
docker build --target migrate -t gusring-migrate:$TAG .
docker save gusring-server:$TAG gusring-migrate:$TAG | gzip | ssh <nas> 'gunzip | docker load'
scp -r deploy/nas/. <nas>:/share/Container/gusring/
```

NAS:

```bash
cd /share/Container/gusring
cp .env.example .env && chmod 600 .env   # TAG, 비밀값 3개 채우기
docker compose up -d                     # 인증서 없으면 Nginx는 인증서 받기용 HTTP 설정으로 뜬다
bash issue-cert.sh                       # (처음 한 번) ZeroSSL 계정 등록용. EAB 키 입력
bash issue-cert-dns.sh                   # 실제 발급은 DNS 인증으로 (아래 "인증서")
```

## 새 버전 올리기

저장소 루트에서 (Git Bash, 로컬 테스트 DB `npm run db:up` 필요):

```bash
bash deploy/nas/deploy.sh            # 현재 커밋 배포 (약 2분)
bash deploy/nas/deploy.sh rollback   # 바로 전 버전으로 (한 번 더 하면 다시 최신으로)
```

커밋 안 된 변경이 있으면 멈춘다 → 타입 검사·테스트 → 이미지 빌드 → NAS DB 백업 → 이미지 전송
→ 설정 복사(`.env` 제외) → `TAG` 바꾸고 재시작(이전 값은 `PREV_TAG`) → HTTPS 확인.
마이그레이션은 `migrate`가 서버보다 먼저 한 번 돈다. 2026-11-03 실제 배포·되돌리기 양방향 확인.

## 확인

```bash
docker compose ps
docker compose logs --tail 50 app nginx
curl -s https://gusring.kro.kr/health
```

- 관리자 통계 화면: https://gusring.kro.kr/admin (관리자 아이디·비밀번호로 로그인)
- API 문서: https://gusring.kro.kr/api-docs
- 서식이 늘거나 이름이 바뀌면 관리자 화면 이름표를 다시 만든다: `node scripts/gen-form-names.mjs ../gusring-web/src/features/forms/data/forms.ts`

## 관리자 계정

가입 화면은 없다. NAS에서 명령으로 만든다. 비밀번호는 화면에 보이지 않게 두 번 묻는다 (10자 이상).
명령줄에 비밀번호를 적지 않는다 (셸 기록에 남는다).

```bash
cd /share/Container/gusring
docker compose exec app node dist/cli/admin-user.js create <아이디>    # 영문 소문자로 시작, 3~32자
docker compose exec app node dist/cli/admin-user.js list
docker compose exec app node dist/cli/admin-user.js passwd <아이디>    # 바꾸면 그 계정 로그인이 모두 끊김
docker compose exec app node dist/cli/admin-user.js disable <아이디>   # 막기 (바로 로그아웃). 다시 쓰기: enable
docker compose exec app node dist/cli/admin-user.js unlock <아이디>    # 5번 실패로 잠긴 것 바로 풀기
```

- 계정은 사람마다 따로 만든다. 누가 피드백을 바꾸거나 지웠는지 관리 기록에 남는다
- 2시간 쓰지 않거나 로그인 12시간 뒤 다시 로그인
- `ADMIN_TOKEN`은 스크립트용으로만 남겨 둔다 (비워 두면 토큰으로는 못 들어온다)

## DB 백업·복원

`backup` 컨테이너가 매일 4시(한국 시간) 이후 하루 한 번 `backups/gusring-YYYY-MM-DD.sql.gz`로 저장하고, 14일 지난 파일은 지운다.
파일 권한은 600 (피드백 본문에 개인정보가 섞일 수 있음). NAS 밖으로 복사해 두려면 이 폴더를 가져가면 된다.

```bash
docker compose exec backup sh /backup-loop.sh now     # 지금 바로 한 번 (예: 배포 전)
docker compose logs --tail 20 backup                  # 백업 기록
```

복원 (운영 DB를 덮어쓰기 전에 꼭 임시 DB로 먼저 확인):

```bash
f=gusring-YYYY-MM-DD.sql.gz
docker compose exec db createdb -U gusring gusring_restore_test
docker compose exec -T backup sh -c "gunzip -c /backups/$f | psql -v ON_ERROR_STOP=1 -d gusring_restore_test"
# 확인 후 운영으로 바꾸려면: app 멈춤 → gusring DB 지우고 같은 방법으로 복원 → app 시작
docker compose exec db dropdb -U gusring gusring_restore_test
```

2026-11-03 확인: 로컬에서 다국어 데이터 503건 백업→복원 후 건수·본문 해시·마이그레이션 기록 일치, NAS에서 운영 DB 복원 시험 일치.

## 인증서 (ZeroSSL, DNS 인증) — 손으로 갱신

학교 네트워크가 **해외에서 들어오는 접속을 막아**(2026-11-03, check-host.net 해외 46~47곳 모두 시간 초과.
`.7`뿐 아니라 TIMIROOM `.8`도 같음) ZeroSSL이 HTTP(80)로 확인하러 들어오지 못한다.
그래서 도메인 DNS에 TXT 기록을 넣는 **DNS 인증**으로 받는다. 학교 안에서는 HTTP 확인이 되는 것처럼 보이니 속지 말 것.

- 첫 발급 2026-11-03, **만료 2027-02-01** (90일짜리)
- certbot 컨테이너의 자동 갱신은 HTTP 방식이라 **실패한다**. 만료 30일 전쯤(1월 초) 손으로 갱신한다

갱신 순서:

```bash
cd /share/Container/gusring
bash issue-cert-dns.sh            # 백그라운드로 시작 (TXT 기록이 보일 때까지 30분 기다림)
bash issue-cert-dns.sh status     # 넣을 TXT 값 확인
```

1. 내도메인.한국 → 도메인 관리 → `gusring.kro.kr` [수정] → TXT(SPF) 체크, 이름 `_acme-challenge`, 값 = status에 나온 값 → 보안코드 → 수정하기
2. 네임서버 두 곳(`1.ns.dnsze.com`, `2.ns.dnsze.com`)에 보이면 자동으로 발급된다 (이번에는 저장 후 약 10분)
3. `docker compose restart nginx`

해외 접속이 열리면(학교 전산실에 `.7` 80번 포트 해외 허용 요청) 자동 갱신으로 바꿀 수 있다.

## 도메인 연장 — 3개월마다

`gusring.kro.kr`(내도메인.한국)은 **3개월짜리**다. 첫 등록 2026-11-03, **만료 2027-02-03**.
만료 전에 내도메인.한국 → 도메인 관리에서 연장한다. 놓치면 주소가 사라져 API가 끊긴다.

## 주의

- `naco-llm-nginx`(꺼져 있음)도 `223.194.166.7`로 설정돼 있다. 다시 켜면 IP가 겹친다
- Nginx는 6시간마다 설정을 다시 읽는다 (갱신한 인증서는 늦어도 6시간 안에 적용, 바로 하려면 restart)
- `.env`에는 DB 비밀번호·관리자 토큰이 있다. 권한 600 유지, 저장소에 올리지 않는다
- QNAP은 `internal: true` 네트워크를 만들지 못한다 (NAT 규칙 추가 실패)
- QNAP에는 `stty`가 없다. 스크립트에서 입력을 숨길 때는 bash `read -s`
