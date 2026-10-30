#!/usr/bin/env bash
set -euo pipefail

deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$deploy_dir"

fail() { printf '%s\n' "$*" >&2; exit 1; }

# 이미지 교체를 직렬화하고 실패한 버전을 정상 배포 기록에 덮어쓰지 않습니다.
[[ $# -eq 1 ]] || fail "사용법: sudo bash deploy.sh <검증한 전체 API 이미지:태그 또는 @digest>"
image=$1
[[ "$image" =~ ^[a-z0-9][a-zA-Z0-9./:@_-]+$ ]] || fail "이미지 참조 형식을 확인하세요."
[[ -f .deploy.env && -f .env.prod ]] || fail ".deploy.env와 .env.prod를 먼저 준비하세요."
command -v flock >/dev/null || fail "Ubuntu의 flock이 필요합니다."
exec 9>.deployment.lock
flock -n 9 || fail "다른 운영 배포가 진행 중입니다."

candidate=$(mktemp "$deploy_dir/.deployCandidate.XXXXXX")
trap 'rm -f -- "$candidate"' EXIT
awk '!/^API_IMAGE=/' .deploy.env > "$candidate"
printf 'API_IMAGE=%s\n' "$image" >> "$candidate"

compose() { docker compose --env-file "$candidate" -f compose.prod.yml "$@"; }

compose config --quiet
compose pull api
compose up -d --wait --wait-timeout 60 redis

# DB Migration이 이미 적용됐을 수 있어 장애 시 이전 이미지를 자동 실행하지 않습니다.
if ! compose up -d --no-deps --wait --wait-timeout 180 api; then
    fail "API 준비 확인 실패. 컨테이너는 시도한 버전일 수 있습니다. DB 호환성과 로그를 확인한 뒤 복구하세요."
fi
compose up -d --no-deps --wait --wait-timeout 60 nginx
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload
cp .deploy.env .previousDeploy.env
mv "$candidate" .deploy.env
printf '%s\n' "API 준비 확인 완료. 외부 HTTPS와 실제 로그인·업무 동작을 추가로 확인하세요."
