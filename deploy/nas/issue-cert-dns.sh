#!/bin/bash
# HTTPS 인증서 발급·갱신 (ZeroSSL, DNS 인증). NAS의 /share/Container/gusring 에서:
#   bash issue-cert-dns.sh          # API_DOMAIN(.env) 인증서. 백그라운드로 시작
#   bash issue-cert-dns.sh start <도메인>   # 다른 도메인 인증서 (도메인을 옮길 때)
#   bash issue-cert-dns.sh status   # 넣을 TXT 값과 진행 상태 보기
#
# 왜 DNS 인증인가: 학교 네트워크가 해외에서 들어오는 접속을 막아(2026-11-03 확인),
# ZeroSSL이 HTTP(80)로 확인하러 들어오지 못한다. DNS 인증은 ZeroSSL이 내도메인.한국 DNS만 본다.
# ZeroSSL 계정은 첫 발급 때(issue-cert.sh) 등록돼 있어 EAB 키가 다시 필요 없다.
# 인증서는 90일짜리. 만료 30일 전쯤 다시 실행한다 (TXT 값은 매번 바뀐다).
set -eu
cd "$(dirname "$0")"
export PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin"
DOMAIN=$(grep '^API_DOMAIN=' .env | cut -d= -f2-)
[ "${1:-}" = "start" ] && [ -n "${2:-}" ] && DOMAIN=$2
RUN=gusring-certbot-dns

if [ "${1:-}" = "status" ]; then
  docker compose exec -T certbot cat /etc/letsencrypt/gusring-dns-txt.txt 2>/dev/null || echo "(아직 TXT 값 없음)"
  docker logs --tail 5 $RUN 2>&1 || echo "(발급 컨테이너 없음)"
  exit 0
fi

docker rm -f $RUN >/dev/null 2>&1 || true
docker compose exec -T certbot rm -f /etc/letsencrypt/gusring-dns-txt.txt || true
docker compose run -d --name $RUN \
  -v "$PWD/dns-hook.sh:/gusring/dns-hook.sh:ro" \
  --entrypoint certbot certbot certonly \
  --manual --preferred-challenges dns \
  --manual-auth-hook "sh /gusring/dns-hook.sh" \
  --server https://acme.zerossl.com/v2/DV90 \
  -d "$DOMAIN" --agree-tos --non-interactive --keep-until-expiring
echo "시작했습니다. 잠시 뒤 'bash issue-cert-dns.sh status'로 넣을 TXT 값을 확인하세요."
