#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# 기존 수동 실행 명령을 유지하면서 배포·외부 검증·조건부 복귀를 하나의 잠금 안에서 처리합니다.
exec python3 "$script_dir/deployApi.py" "$@"
