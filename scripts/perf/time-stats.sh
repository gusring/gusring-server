#!/bin/bash
# 통계 API 응답 시간 (docs/performance.md). 사용: BASE=http://localhost:4000 ADMIN_TOKEN=... bash scripts/perf/time-stats.sh
set -u
: "${ADMIN_TOKEN:?ADMIN_TOKEN 필요}"
B="${BASE:-http://localhost:4000}/api/v1/admin/stats"
H="Authorization: Bearer $ADMIN_TOKEN"
today=$(TZ=Asia/Seoul date +%F); y=$(TZ=Asia/Seoul date -d '-365 days' +%F)
echo "endpoint 30일 366일 (5번 중 가장 느린 값, 초)"
for ep in summary forms daily search fill export; do
  row="$ep"
  for q in "" "?from=$y&to=$today"; do
    curl -s -o /dev/null -H "$H" "$B/$ep$q"
    row="$row $(for _ in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}\n' -H "$H" "$B/$ep$q"; done | sort -n | tail -1)"
  done
  echo "$row"
done
