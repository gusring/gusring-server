#!/bin/sh
# Nginx 컨테이너가 뜰 때 compose의 command에서 실행된다.
# 인증서가 있으면 HTTPS 설정, 없으면 인증서 받기용 HTTP 설정을 고른다.
set -eu

: "${API_DOMAIN:?API_DOMAIN 필요}"
cert="/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem"

if [ -f "$cert" ]; then
  tpl=/etc/gusring-nginx/https.conf.template
  echo "[gusring] 인증서 있음 → HTTPS 설정 (${API_DOMAIN})"
else
  tpl=/etc/gusring-nginx/http-only.conf.template
  echo "[gusring] 인증서 없음 → 인증서 받기용 HTTP 설정 (${API_DOMAIN})"
fi

# ${API_DOMAIN}만 바꾼다 (Nginx 자체 변수 $host 등은 그대로)
envsubst '${API_DOMAIN}' < "$tpl" > /etc/nginx/conf.d/default.conf
nginx -t
