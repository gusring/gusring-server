#!/bin/sh
# Nginx는 내부망(앱 연결)과 공인망(PUBLIC_IP) 둘 다에 붙는다. 시작할 때 공인망 쪽을 정리한다.
#
# 1) 기본 경로를 공인망 게이트웨이로: Docker 27은 기본 경로를 어느 망으로 잡을지 정할 수 없다(gw_priority는 28부터).
#    밖에서 온 요청의 응답이 내부망으로 나가지 않게 고정한다.
# 2) 공인 IP의 새 MAC을 알린다: 컨테이너를 다시 만들 때마다 MAC이 무작위로 바뀌는데, 학교 라우터는 예전 MAC을
#    기억하고 있어 몇 시간 동안 .7로 오는 요청이 사라졌다 (2026-11-04·05 배포 직후 접속 불가, 알림 후 바로 복구로 확인).
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

# 알림은 몇 초 걸리므로 뒤에서 보내고 Nginx는 바로 띄운다. 실패해도 Nginx는 그대로 (시간이 지나면 라우터가 다시 배운다)
(
  arping -U -c 3 -I "$dev" "$PUBLIC_IP" >/dev/null 2>&1 || echo "[gusring] MAC 알림(gratuitous ARP) 실패"
  arping -c 2 -I "$dev" "$PUBLIC_GW" >/dev/null 2>&1 || echo "[gusring] 게이트웨이 ARP 응답 없음"
  echo "[gusring] $PUBLIC_IP MAC 알림 보냄 ($(cat "/sys/class/net/$dev/address"))"
) &
