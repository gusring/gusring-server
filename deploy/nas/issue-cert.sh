#!/bin/sh
# 첫 HTTPS 인증서 발급 (ZeroSSL). NAS의 /share/Container/gusring 에서 실행:
#   sh issue-cert.sh
# EAB 키(ZeroSSL 대시보드 → Developer)는 화면에 안 보이게 입력받는다. 명령 기록에도 남지 않는다.
# kro.kr은 여러 사람이 같이 쓰는 주소라 Let's Encrypt 발급 한도에 자주 걸려 ZeroSSL을 쓴다.
set -eu
cd "$(dirname "$0")"
export PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin"

DOMAIN=$(grep '^API_DOMAIN=' .env | cut -d= -f2-)
[ -n "$DOMAIN" ] || { echo ".env에 API_DOMAIN이 없습니다"; exit 1; }

printf '인증서 받을 도메인: %s\n' "$DOMAIN"
printf '알림 받을 이메일: '; read -r EMAIL
printf 'ZeroSSL EAB Key ID: '; stty -echo; read -r EAB_KID; stty echo; echo
printf 'ZeroSSL EAB HMAC Key: '; stty -echo; read -r EAB_HMAC; stty echo; echo

docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --server https://acme.zerossl.com/v2/DV90 \
  --eab-kid "$EAB_KID" --eab-hmac-key "$EAB_HMAC" \
  -d "$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

unset EAB_KID EAB_HMAC
echo "발급 완료 → Nginx를 HTTPS 설정으로 다시 띄웁니다"
docker compose restart nginx
