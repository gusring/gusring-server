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

# 컨테이너가 막 떴을 때는 공인망 연결이 아직 준비되지 않아 알림이 라우터에 닿지 않는다(11-05 운영: 시작 직후 게이트웨이 무응답).
# 게이트웨이가 ARP에 답할 때까지(최대 60초) 기다린 뒤 알린다. 뒤에서 돌리고 Nginx는 바로 띄운다.
(
  tries=0
  until arping -c 1 -w 2 -I "$dev" "$PUBLIC_GW" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      echo "[gusring] 게이트웨이 $PUBLIC_GW 가 60초 동안 응답하지 않음. 그래도 알림을 보낸다"
      break
    fi
    sleep 2
  done
  arping -U -c 3 -I "$dev" "$PUBLIC_IP" >/dev/null 2>&1 || echo "[gusring] MAC 알림(gratuitous ARP) 실패"
  echo "[gusring] $PUBLIC_IP MAC 알림 보냄 ($(cat "/sys/class/net/$dev/address"), 게이트웨이 대기 ${tries}회)"
) &
