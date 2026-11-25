#!/bin/sh
# DB 백업 (compose의 backup 컨테이너에서 돈다)
#   기본   : 한 시간마다 확인해서, 오늘 백업이 없고 BACKUP_HOUR(한국 시간) 이후면 한 번 백업
#   now    : 지금 바로 한 번 (파일 이름에 시각까지)
# 보관: KEEP_DAYS일 지난 백업 파일은 지운다
set -u
set -o pipefail
: "${BACKUP_HOUR:=4}" "${KEEP_DAYS:=14}"
# 피드백 본문에 개인정보가 섞일 수 있어 백업 파일은 소유자만 읽게 (600)
umask 077
mkdir -p /backups

dump() {  # $1 = 파일 이름
  f="/backups/$1"
  if pg_dump --no-owner --no-privileges | gzip > "$f.tmp" && gzip -t "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "[backup] $(date '+%F %T') 저장 $f ($(wc -c < "$f") bytes)"
  else
    rm -f "$f.tmp"
    echo "[backup] $(date '+%F %T') 실패" >&2
    return 1
  fi
  find /backups -name 'gusring-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] 오래된 백업 삭제 /'
}

if [ "${1:-}" = "now" ]; then
  dump "gusring-$(date +%F_%H%M%S).sql.gz"
  exit $?
fi

echo "[backup] 시작: 매일 ${BACKUP_HOUR}시 이후 한 번, ${KEEP_DAYS}일 보관"
while :; do
  today=$(date +%F)
  if [ ! -s "/backups/gusring-$today.sql.gz" ] && [ "$(date +%H)" -ge "$BACKUP_HOUR" ]; then
    dump "gusring-$today.sql.gz" || true
  fi
  sleep 3600 & wait $!
done
