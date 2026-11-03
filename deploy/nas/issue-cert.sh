#!/bin/bash
# 첫 HTTPS 인증서 발급 (ZeroSSL). NAS의 /share/Container/gusring 에서 실행:
#   bash issue-cert.sh
# EAB 키(ZeroSSL 대시보드 → Developer)는 화면에 안 보이게 입력받는다. 명령 기록에도 남지 않는다.
# kro.kr은 여러 사람이 같이 쓰는 주소라 Let's Encrypt 발급 한도에 자주 걸려 ZeroSSL을 쓴다.
set -eu
cd "$(dirname "$0")"
export PATH="$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin"

DOMAIN=$(grep '^API_DOMAIN=' .env | cut -d= -f2-)
[ -n "$DOMAIN" ] || { echo ".env에 API_DOMAIN이 없습니다"; exit 1; }

printf '인증서 받을 도메인: %s\n' "$DOMAIN"
printf '알림 받을 이메일: '; read -r EMAIL
# QNAP에는 stty가 없다 → bash의 read -s로 입력 숨김
# 숨긴 칸에 붙여넣으면 제어 문자(Ctrl+V가 ^V로 들어감, 붙여넣기 표시 ESC[200~ 등)가 섞일 수 있어 걸러낸다
clean() { printf '%s' "$1" | sed $'s/\x1b\\[20[01]~//g' | tr -cd 'A-Za-z0-9_-'; }
# ZeroSSL 형식: Key ID 22자, HMAC Key 86자 (석현님 예시·실제 발급값으로 확인)
ask_key() {  # $1=질문 $2=정확한 길이 → 결과는 KEY 변수
  local raw
  while :; do
    read -rsp "$1" raw; echo
    KEY=$(clean "$raw")
    if [ ${#KEY} -eq "$2" ]; then return; fi
    echo "  → 받은 값이 ${#KEY}자입니다. 이 키는 정확히 $2자여야 합니다."
    echo "    ZeroSSL 화면에서 이 키 하나만(옆 글자 없이) 복사해 마우스 오른쪽 클릭이나 Ctrl+Shift+V로 다시 붙여넣어 주세요."
  done
}
ask_key 'ZeroSSL EAB Key ID: ' 22;   EAB_KID=$KEY
echo "  → Key ID ${#EAB_KID}자 받음 (앞 4자리: ${EAB_KID:0:4}…)"
ask_key 'ZeroSSL EAB HMAC Key: ' 86; EAB_HMAC=$KEY
echo "  → HMAC Key ${#EAB_HMAC}자 받음 (앞뒤 4자리: ${EAB_HMAC:0:4}…${EAB_HMAC: -4})"
printf '이 값으로 발급할까요? [y/N] '; read -r ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo '취소했습니다'; exit 1; }

docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --server https://acme.zerossl.com/v2/DV90 \
  --eab-kid "$EAB_KID" --eab-hmac-key "$EAB_HMAC" \
  -d "$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

unset EAB_KID EAB_HMAC
echo "발급 완료 → Nginx를 HTTPS 설정으로 다시 띄웁니다"
docker compose restart nginx
