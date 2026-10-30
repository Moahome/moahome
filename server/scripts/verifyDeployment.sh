#!/usr/bin/env bash
set -euo pipefail
umask 077

server_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export SMOKE_DIR
SMOKE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/moahome-deploy.XXXXXX")
project="moahome-verify-$(date +%s)-$$"
api_image=${API_IMAGE:-moahome-api:local-check}

compose() {
    docker compose --project-name "$project" --env-file "$SMOKE_DIR/deploy.env" \
        -f "$server_dir/deploy/compose.prod.yml" -f "$SMOKE_DIR/compose.test.yml" "$@"
}

# 테스트마다 고유한 프로젝트·DB·볼륨을 사용하고, 실패해도 자신이 만든 리소스만 정리합니다.
cleanup() {
    result=$?
    trap - EXIT
    if [[ -f "$SMOKE_DIR/deploy.env" && -f "$SMOKE_DIR/compose.test.yml" ]]; then
        if [[ $result -ne 0 ]]; then
            compose logs --tail=60 api nginx postgres >&2 || true
        fi
        if ! compose down --volumes --remove-orphans >/dev/null 2>&1; then
            printf '임시 리소스 정리 실패: %s\n' "$project" >&2
            result=1
        fi
    fi
    rm -rf -- "$SMOKE_DIR"
    exit "$result"
}
trap cleanup EXIT

if [[ ${SMOKE_SKIP_BUILD:-0} != 1 ]]; then
    docker build --tag "$api_image" "$server_dir"
fi

mkdir -p "$SMOKE_DIR/letsencrypt/live/api.example.test" "$SMOKE_DIR/www/.well-known/acme-challenge"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=moahome-local-ca \
    -keyout "$SMOKE_DIR/ca.key" -out "$SMOKE_DIR/ca.pem" >/dev/null 2>&1

# DB와 HTTPS 모두 이름 검증이 가능한 로컬 CA 인증서를 사용합니다. 실제 발급 기관에는 요청하지 않습니다.
for name in postgres api.example.test; do
    openssl req -new -newkey rsa:2048 -nodes -subj "/CN=$name" \
        -keyout "$SMOKE_DIR/$name.key" -out "$SMOKE_DIR/$name.csr" >/dev/null 2>&1
    printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$name" > "$SMOKE_DIR/$name.ext"
    openssl x509 -req -in "$SMOKE_DIR/$name.csr" -CA "$SMOKE_DIR/ca.pem" -CAkey "$SMOKE_DIR/ca.key" \
        -CAcreateserial -days 1 -extfile "$SMOKE_DIR/$name.ext" \
        -out "$SMOKE_DIR/$name.pem" >/dev/null 2>&1
done
cp "$SMOKE_DIR/api.example.test.pem" "$SMOKE_DIR/letsencrypt/live/api.example.test/fullchain.pem"
cp "$SMOKE_DIR/api.example.test.key" "$SMOKE_DIR/letsencrypt/live/api.example.test/privkey.pem"
printf 'acme-local-check' > "$SMOKE_DIR/www/.well-known/acme-challenge/probe"
# Linux 러너에서도 API 비루트 사용자와 Nginx worker가 공개 인증서·challenge를 읽을 수 있게 합니다.
chmod 644 "$SMOKE_DIR/ca.pem" "$SMOKE_DIR/www/.well-known/acme-challenge/probe"
chmod 755 "$SMOKE_DIR/www" "$SMOKE_DIR/www/.well-known" "$SMOKE_DIR/www/.well-known/acme-challenge"

db_password=$(openssl rand -hex 24)
printf 'POSTGRES_USER=moahome_app\nPOSTGRES_DB=moahome\nPOSTGRES_PASSWORD=%s\n' "$db_password" > "$SMOKE_DIR/postgres.env"
cat > "$SMOKE_DIR/app.env" <<EOF
SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/moahome?sslmode=verify-full&sslrootcert=/etc/rds/rds-ca.pem
SPRING_DATASOURCE_USERNAME=moahome_app
SPRING_DATASOURCE_PASSWORD=$db_password
SPRING_DATA_REDIS_HOST=redis
SPRING_DATA_REDIS_PORT=6379
WEB_ALLOWED_ORIGINS=https://app.example.test
KAKAO_CLIENT_ID=local-validation-only
KAKAO_CLIENT_SECRET=$(openssl rand -hex 24)
KAKAO_REDIRECT_URI=https://api.example.test/login/oauth2/code/kakao
WEB_LOGIN_SUCCESS_URI=https://app.example.test/login/callback
JWT_ACCESS_SECRET_BASE64=$(openssl rand -base64 64 | tr -d '\n')
JWT_REFRESH_SECRET_BASE64=$(openssl rand -base64 64 | tr -d '\n')
ACCOUNT_ENCRYPTION_KEY_BASE64=$(openssl rand -base64 32 | tr -d '\n')
ACCOUNT_HMAC_KEY_BASE64=$(openssl rand -base64 32 | tr -d '\n')
REGISTRATION_FINGERPRINT_KEY_BASE64=$(openssl rand -base64 32 | tr -d '\n')
PHONE_ENCRYPTION_KEY_BASE64=$(openssl rand -base64 32 | tr -d '\n')
PHONE_HMAC_KEY_BASE64=$(openssl rand -base64 32 | tr -d '\n')
JAVA_TOOL_OPTIONS=-Xms128m -Xmx1536m
EOF
unset db_password

cat > "$SMOKE_DIR/deploy.env" <<EOF
API_IMAGE=$api_image
API_DOMAIN=api.example.test
APP_ENV_FILE=$SMOKE_DIR/app.env
RDS_CA_FILE=$SMOKE_DIR/ca.pem
CERTIFICATE_DIR=$SMOKE_DIR/letsencrypt
ACME_WEBROOT=$SMOKE_DIR/www
HTTP_BIND=127.0.0.1
HTTP_PORT=0
HTTPS_PORT=0
EOF

cat > "$SMOKE_DIR/compose.test.yml" <<'EOF'
services:
  postgres:
    image: postgres:17
    env_file:
      - path: ${SMOKE_DIR}/postgres.env
        format: raw
    volumes:
      - ${SMOKE_DIR}/postgres.pem:/certs/server.crt:ro
      - ${SMOKE_DIR}/postgres.key:/certs/server.key:ro
    # PostgreSQL은 비밀키 소유권을 검사하므로 임시 컨테이너 안에 복사한 키만 사용합니다.
    entrypoint: [/bin/sh, -ec]
    command:
      - |
        cp /certs/server.crt /var/lib/postgresql/server.crt
        cp /certs/server.key /var/lib/postgresql/server.key
        chown postgres:postgres /var/lib/postgresql/server.crt /var/lib/postgresql/server.key
        chmod 600 /var/lib/postgresql/server.key
        exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/var/lib/postgresql/server.crt -c ssl_key_file=/var/lib/postgresql/server.key
    healthcheck:
      test: [CMD, pg_isready, -U, moahome_app, -d, moahome]
      interval: 3s
      timeout: 3s
      retries: 20
    networks: [backend]
  api:
    depends_on:
      postgres:
        condition: service_healthy
EOF

compose config --quiet
compose up -d --wait --wait-timeout 240
container_uid=$(compose exec -T api id -u)
[[ "$container_uid" == 10001 ]]
tls_connections=$(compose exec -T postgres psql -U moahome_app -d moahome -tAc \
    "SELECT count(*) FROM pg_stat_ssl JOIN pg_stat_activity USING(pid) WHERE usename='moahome_app' AND ssl")
[[ "$tls_connections" -gt 0 ]]
compose cp api:/app/app.jar "$SMOKE_DIR/app.jar" >/dev/null
jar tf "$SMOKE_DIR/app.jar" > "$SMOKE_DIR/jarEntries.txt"
if grep -Eq '(^|/)(\.env[^/]*|application-local\.properties|application[^/]*\.ya?ml)$' "$SMOKE_DIR/jarEntries.txt"; then
    printf '%s\n' '운영 JAR에 로컬 전용 설정이 포함되어 있습니다.' >&2
    exit 1
fi
https_port=$(compose port nginx 443 | awk -F: '{print $NF}')
http_port=$(compose port nginx 80 | awk -F: '{print $NF}')

request() {
    curl --noproxy '*' --silent --show-error --max-time 15 --cacert "$SMOKE_DIR/ca.pem" \
        --resolve "api.example.test:$https_port:127.0.0.1" \
        "$@" "https://api.example.test:$https_port$path"
}
expect_status() {
    expected=$1
    path=$2
    actual=$(request --output "$SMOKE_DIR/response.json" --write-out '%{http_code}')
    [[ "$actual" == "$expected" ]] || { printf '%s: expected %s, got %s\n' "$path" "$expected" "$actual" >&2; exit 1; }
}

expect_status 200 /actuator/health/readiness
[[ $(cat "$SMOKE_DIR/response.json") == '{"status":"UP"}' ]]
# 외부가 전달한 프록시 헤더로 API의 경로·호스트·HTTPS 판단을 바꾸지 못하게 합니다.
path=/actuator/health/readiness
spoof_status=$(request --header 'Forwarded: for=127.0.0.1;host=untrusted.example;proto=http' \
    --header 'X-Forwarded-Prefix: /forged' --header 'X-Forwarded-Host: untrusted.example' \
    --header 'X-Forwarded-Proto: http' --output /dev/null --write-out '%{http_code}')
[[ "$spoof_status" == 200 ]]
expect_status 401 /api/users/me
expect_status 404 /actuator/env
expect_status 401 /v3/api-docs

# API 진입 전의 ACME 파일 제공과 HTTP→HTTPS 전환도 확인합니다.
[[ $(curl --noproxy '*' --fail --silent "http://127.0.0.1:$http_port/.well-known/acme-challenge/probe") == acme-local-check ]]
[[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$http_port/") == 308 ]]

# 테스트 전용 값만 기록하고 강제 재생성 후 AOF와 Named Volume에서 복구되는지 확인합니다.
compose exec -T redis redis-cli SET deployment:probe local-only EX 300 >/dev/null
sleep 2
compose up -d --no-deps --force-recreate --wait redis
[[ $(compose exec -T redis redis-cli GET deployment:probe | tr -d '\r') == local-only ]]

# 저장소 장애를 준비 완료로 오인하지 않고 상태만 503으로 반환하는지 확인합니다.
compose stop redis
expect_status 503 /actuator/health/readiness
[[ $(cat "$SMOKE_DIR/response.json") == '{"status":"DOWN"}' ]]
compose up -d --wait redis
for ((attempt=0; attempt<20; attempt++)); do
    path=/actuator/health/readiness
    if [[ $(request --output /dev/null --write-out '%{http_code}') == 200 ]]; then break; fi
    sleep 1
done
expect_status 200 /actuator/health/readiness

# API 교체 뒤 Nginx의 DNS 재조회로 새 컨테이너에 연결되는지 확인합니다.
compose up -d --no-deps --force-recreate --wait --wait-timeout 180 api
sleep 6
expect_status 200 /actuator/health/readiness
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload

# 인증서가 없는 최초 HTTP 설정도 API와 독립적으로 실행 가능한지 확인합니다.
NGINX_TEMPLATE=./nginx/http.conf.template compose up -d --no-deps --wait --wait-timeout 60 nginx
http_port=$(compose port nginx 80 | awk -F: '{print $NF}')
[[ $(curl --noproxy '*' --fail --silent "http://127.0.0.1:$http_port/.well-known/acme-challenge/probe") == acme-local-check ]]
[[ $(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$http_port/") == 503 ]]
compose up -d --no-deps --wait --wait-timeout 60 nginx
https_port=$(compose port nginx 443 | awk -F: '{print $NF}')
expect_status 200 /actuator/health/readiness
printf '%s\n' '운영 이미지·Flyway·JPA·DB TLS·Nginx HTTPS·인증 보호·Redis AOF/장애 복구·API 교체 검증 통과'
