#!/bin/sh
# certbot --manual-auth-hook (DNS 인증). certbot 컨테이너 안에서 실행된다.
# 1) ZeroSSL이 준 TXT 값을 /etc/letsencrypt/gusring-dns-txt.txt 에 남긴다 → 사람이 내도메인.한국에 넣는다
# 2) 내도메인.한국 네임서버 두 곳에 그 값이 보일 때까지 기다린다 (최대 30분)
set -u
NAME="_acme-challenge.${CERTBOT_DOMAIN}"
OUT=/etc/letsencrypt/gusring-dns-txt.txt
printf 'name=%s\nvalue=%s\n' "$NAME" "$CERTBOT_VALIDATION" > "$OUT"
echo "[dns-hook] TXT 기록을 넣어 주세요: $NAME = $CERTBOT_VALIDATION"

i=0
while [ $i -lt 180 ]; do
  ok=0
  for ns in 1.ns.dnsze.com 2.ns.dnsze.com; do
    nslookup -type=TXT "$NAME" "$ns" 2>/dev/null | grep -q "$CERTBOT_VALIDATION" && ok=$((ok + 1))
  done
  if [ $ok -eq 2 ]; then
    echo "[dns-hook] 네임서버 두 곳에서 확인됨 → 30초 뒤 진행"
    sleep 30
    exit 0
  fi
  i=$((i + 1))
  sleep 10
done
echo "[dns-hook] 30분 안에 TXT 기록이 보이지 않았습니다"
exit 1
