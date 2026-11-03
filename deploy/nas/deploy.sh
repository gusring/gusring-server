#!/bin/bash
# 새 버전을 NAS에 올린다 (이 저장소 루트에서 Git Bash로 실행)
#   bash deploy/nas/deploy.sh             # 현재 커밋을 배포
#   bash deploy/nas/deploy.sh rollback    # 바로 전 버전으로 되돌리기
#
# 순서: 커밋 안 된 변경 확인 → 타입 검사·테스트 → 이미지 빌드 → NAS DB 백업
#       → 이미지 전송 → 설정 파일 복사(.env 제외) → TAG 바꾸고 재시작 → HTTPS 확인
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

NAS="${NAS:-gkdmsgus@dongyang.mycloudnas.com}"
KEY="${NAS_KEY:-$HOME/.ssh/timiroom_nas_ed25519}"
DIR=/share/Container/gusring
URL="${HEALTH_URL:-https://gusring.kro.kr/health}"
SSH=(ssh -F /dev/null -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$NAS")
SCP=(scp -F /dev/null -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -q)
REMOTE_ENV="export PATH=\$PATH:/share/CACHEDEV1_DATA/.qpkg/container-station/bin; cd $DIR"

step() { printf '\n== %s\n' "$*"; }

wait_healthy() {
  for _ in $(seq 1 20); do
    if body=$(curl -fsS -m 5 "$URL" 2>/dev/null) && [[ $body == *'"ok"'* ]]; then
      echo "정상: $body"; return 0
    fi
    sleep 3
  done
  echo "60초 안에 정상 응답이 없습니다 ($URL)"; return 1
}

if [ "${1:-}" = "rollback" ]; then
  step "이전 버전으로 되돌리기"
  "${SSH[@]}" "$REMOTE_ENV
    prev=\$(grep '^PREV_TAG=' .env | cut -d= -f2-); cur=\$(grep '^TAG=' .env | cut -d= -f2-)
    [ -n \"\$prev\" ] || { echo '되돌릴 PREV_TAG가 없습니다'; exit 1; }
    sed -i \"s/^TAG=.*/TAG=\$prev/; s/^PREV_TAG=.*/PREV_TAG=\$cur/\" .env
    echo \"\$cur → \$prev\"
    docker compose up -d --wait app 2>&1 | grep -vE '^inserted' | tail -2"
  wait_healthy
  exit 0
fi

step "커밋 안 된 변경 확인"
if [ -n "$(git status --porcelain)" ]; then
  git status --short; echo "커밋하지 않은 변경이 있어 중단합니다 (배포 버전을 커밋으로 추적하기 위해)"; exit 1
fi
TAG=$(git rev-parse --short HEAD)
echo "배포할 커밋: $TAG $(git log -1 --format=%s)"

step "타입 검사·테스트 (docker compose의 테스트 DB 필요)"
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  npm run -s typecheck
  npm test 2>&1 | grep -E "Test Files|Tests |FAIL" || true
  npm test >/dev/null 2>&1 || { echo "테스트 실패로 중단"; exit 1; }
else
  echo "(SKIP_TESTS=1, 건너뜀)"
fi

step "이미지 빌드 ($TAG)"
docker build -q --target runtime -t "gusring-server:$TAG" . >/dev/null
docker build -q --target migrate -t "gusring-migrate:$TAG" . >/dev/null
echo "gusring-server:$TAG, gusring-migrate:$TAG"

step "NAS DB 백업 (배포 전)"
"${SSH[@]}" "$REMOTE_ENV; docker compose exec -T backup sh /backup-loop.sh now"

step "이미지 전송"
docker save "gusring-server:$TAG" "gusring-migrate:$TAG" | gzip -1 \
  | "${SSH[@]}" "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker load" | tail -2

step "설정 파일 복사 (.env는 건드리지 않음)"
"${SSH[@]}" "mkdir -p $DIR/nginx/templates $DIR/backup"
"${SCP[@]}" deploy/nas/compose.yml deploy/nas/README.md deploy/nas/*.sh "$NAS:$DIR/"
"${SCP[@]}" deploy/nas/nginx/select-conf.sh "$NAS:$DIR/nginx/"
"${SCP[@]}" deploy/nas/nginx/templates/*.template "$NAS:$DIR/nginx/templates/"
"${SCP[@]}" deploy/nas/backup/backup-loop.sh "$NAS:$DIR/backup/"

step "TAG 바꾸고 재시작"
"${SSH[@]}" "$REMOTE_ENV
  cur=\$(grep '^TAG=' .env | cut -d= -f2-)
  if [ \"\$cur\" != '$TAG' ]; then
    grep -q '^PREV_TAG=' .env && sed -i \"s/^PREV_TAG=.*/PREV_TAG=\$cur/\" .env || echo \"PREV_TAG=\$cur\" >> .env
    sed -i 's/^TAG=.*/TAG=$TAG/' .env
  fi
  echo \"TAG: \$cur → $TAG\"
  docker compose config --quiet
  docker compose up -d --wait 2>&1 | grep -vE '^inserted' | tail -3
  # 설정 파일만 바뀌면 up이 Nginx를 다시 띄우지 않는다 → 설정을 다시 골라 무중단으로 다시 읽기 (nginx -t 실패 시 그대로 둠)
  docker compose exec -T nginx sh -c 'sh /gusring/select-conf.sh && nginx -s reload' 2>&1 | grep -E 'gusring|test is successful|emerg' || true
  docker compose ps --format '{{.Service}} {{.Status}}'"

step "확인"
if ! wait_healthy; then
  echo "되돌리려면: bash deploy/nas/deploy.sh rollback"; exit 1
fi
echo "배포 완료: $TAG"
