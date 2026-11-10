#!/bin/sh
# Nginx 컨테이너가 뜰 때 compose의 command에서 실행된다.
# API_DOMAIN 인증서가 있으면 HTTPS 설정, 없으면 인증서 받기용 HTTP 설정을 고른다.
# EXTRA_DOMAINS(빈칸으로 구분, 선택)는 도메인을 옮기는 동안 같이 받을 이름. 인증서가 있는 것만 넣는다.
set -eu

: "${API_DOMAIN:?API_DOMAIN 필요}"
out=/etc/nginx/conf.d/default.conf
has_cert() { [ -f "/etc/letsencrypt/live/$1/fullchain.pem" ]; }

if has_cert "$API_DOMAIN"; then
  cp /etc/gusring-nginx/https.conf.template "$out"
  for d in $API_DOMAIN ${EXTRA_DOMAINS:-}; do
    if has_cert "$d"; then
      # ${SITE_DOMAIN}만 바꾼다 (Nginx 자체 변수 $host 등은 그대로)
      printf '\n' >> "$out"
      SITE_DOMAIN="$d" envsubst '${SITE_DOMAIN}' < /etc/gusring-nginx/site.conf.template >> "$out"
      echo "[gusring] 인증서 있음 → HTTPS ($d)"
    else
      echo "[gusring] 인증서 없음 → 건너뜀 ($d)"
    fi
  done
else
  envsubst '${API_DOMAIN}' < /etc/gusring-nginx/http-only.conf.template > "$out"
  echo "[gusring] 인증서 없음 → 인증서 받기용 HTTP 설정 (${API_DOMAIN})"
fi

nginx -t
