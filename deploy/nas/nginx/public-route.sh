#!/bin/sh
# Nginx는 내부망(앱 연결)과 공인망(PUBLIC_IP) 둘 다에 붙는다. Docker 27은 기본 경로를 어느 망으로 잡을지
# 정할 수 없어서(gw_priority는 28부터) 컨테이너를 다시 만들 때 내부망이 기본 경로가 되면, 밖에서 온 요청의
# 응답이 내부망으로 나가 사라진다 (2026-11-04 배포 후 접속 불가로 확인). 시작할 때 공인망으로 고정한다.
set -eu

: "${PUBLIC_IP:?PUBLIC_IP 필요}"
: "${PUBLIC_GW:?PUBLIC_GW 필요}"
dev=$(ip -o -4 addr show | awk -v ip="$PUBLIC_IP" '{ split($4, a, "/"); if (a[1] == ip) { print $2; exit } }')
if [ -z "$dev" ]; then
  echo "[gusring] 공인 IP $PUBLIC_IP 가 붙은 인터페이스가 없습니다"
  exit 1
fi
ip route replace default via "$PUBLIC_GW" dev "$dev"
echo "[gusring] 기본 경로 → $PUBLIC_GW ($dev, $PUBLIC_IP)"
