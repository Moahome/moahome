#!/usr/bin/env bash
set -euo pipefail

deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$deploy_dir"

fail() { printf '%s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file .deploy.env -f compose.prod.yml "$@"; }

[[ $EUID -eq 0 ]] || fail "호스트 인증서 접근을 위해 sudo bash certificates.sh로 실행하세요."
[[ -f .deploy.env && -f .env.prod ]] || fail "운영 환경 파일을 먼저 준비하세요."
command -v certbot >/dev/null || fail "Ubuntu 호스트에 Certbot을 설치하세요."
domain=$(awk -F= '$1 == "API_DOMAIN" {print $2}' .deploy.env)
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]] || fail "API_DOMAIN에 실제 도메인 하나를 입력하세요."

# hook만 별도로 호출할 수 있게 해 타이머와 최초 발급의 인증서 재적용을 같은 경로로 처리합니다.
case "${1:-}" in
    issue)
        [[ $# -eq 2 && "$2" == *@* ]] || fail "사용법: sudo bash certificates.sh issue <인증서 연락 이메일>"
        mkdir -p certbot/www /etc/letsencrypt
        NGINX_TEMPLATE=./nginx/http.conf.template compose up -d --no-deps --wait --wait-timeout 60 nginx
        certbot certonly --webroot --webroot-path "$deploy_dir/certbot/www" \
            --domain "$domain" --cert-name "$domain" --email "$2" --agree-tos --non-interactive \
            --deploy-hook "bash '$deploy_dir/certificates.sh' reload"
        compose up -d --no-deps --wait --wait-timeout 60 nginx
        compose exec -T nginx nginx -t
        ;;
    renew)
        # renew 성공 후에만 reload합니다. hook을 따로 설정하지 않은 다른 인증서에는 영향을 주지 않습니다.
        certbot renew --cert-name "$domain" --quiet \
            --deploy-hook "bash '$deploy_dir/certificates.sh' reload"
        ;;
    reload)
        compose exec -T nginx nginx -t
        compose exec -T nginx nginx -s reload
        ;;
    *) fail "사용법: sudo bash certificates.sh issue <이메일> | renew | reload" ;;
esac
