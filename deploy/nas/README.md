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
- 같은 IP 요청 제한: `/events` 분당 60(순간 40), `/feedback` 분당 10(순간 5). 서버 쪽 피드백 10분 5건 제한과 별개
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
sh issue-cert.sh                         # 도메인 A 레코드가 걸린 뒤. ZeroSSL EAB 키 입력
```

## 새 버전 올리기

로컬에서 새 `TAG`로 이미지 두 개를 빌드해 `docker load`까지 한 뒤, NAS `.env`의 `TAG`만 바꾸고 `docker compose up -d`.
마이그레이션은 `migrate`가 서버보다 먼저 한 번 돈다.

## 확인

```bash
docker compose ps
docker compose logs --tail 50 app nginx
curl -s https://gusring.kro.kr/health
```

## 주의

- `naco-llm-nginx`(꺼져 있음)도 `223.194.166.7`로 설정돼 있다. 다시 켜면 IP가 겹친다
- 인증서는 certbot 컨테이너가 12시간마다 갱신을 확인하고, Nginx는 6시간마다 다시 읽는다
- `.env`에는 DB 비밀번호·관리자 토큰이 있다. 권한 600 유지, 저장소에 올리지 않는다
