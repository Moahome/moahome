# Server 운영 배포 가이드

기준일: 2026-10-30. 인프라 구성과 운영 목적은 [공통 배포 계획](../../docs/deploymentPlan.md)을 따릅니다. 이 문서는 저장소에 작성한 배포 파일의 실행법을 설명하며 실제 AWS 구축·인증서 발급 완료를 의미하지 않습니다.

## 1. 파일과 실행 환경

| 파일 | 역할 |
| --- | --- |
| `server/Dockerfile` | JDK 21로 빌드한 JAR을 UID 10001의 JRE 컨테이너에서 실행 |
| `server/.dockerignore` | 허용한 소스·공통·운영 설정만 빌드에 포함 |
| `server/src/main/resources/application-prod.properties` | 운영 저장소 연결·안전한 오류 응답·Health 준비 상태 |
| `server/src/test/resources/application-test.properties` | 개발 설정을 읽지 않는 테스트 환경 |
| `server/deploy/compose.prod.yml` | API·Redis·Nginx, 내부 네트워크·메모리·로그·Health 설정 |
| `server/deploy/nginx/` | 최초 발급용 HTTP 설정, HTTPS·프록시 설정 |
| `server/deploy/redis.conf` | AOF·noeviction·메모리 한도 |
| `server/deploy/.env.example` | 실제 운영 값 없이 제공하는 앱 환경변수 양식 |
| `server/deploy/deploy.env.example` | 공개 도메인·이미지 버전 양식 |
| `server/deploy/deploy.sh` | API 배포 직렬화·준비 확인·이전 정상 설정 보관 |
| `server/deploy/certificates.sh` | 최초 인증서 발급·갱신·Nginx 재적용 |
| `server/deploy/moahomeCertbot.service`·`.timer` | Ubuntu에서 하루 두 번 인증서 갱신 확인 |
| `server/scripts/verifyDeployment.sh` | 임시 DB·인증서·컨테이너를 사용하는 로컬 통합 검증 |
| `.github/workflows/serverCi.yml` | PR 검증, main 이미지 게시 |

운영 호스트는 Ubuntu LTS, Docker Engine과 Compose 플러그인 2.30 이상, Bash·curl·Certbot·flock을 사용합니다. Compose의 raw env_file과 준비 대기를 지원하는 버전이 필요합니다. Docker 설치는 [공식 Ubuntu 안내](https://docs.docker.com/engine/install/ubuntu/)를 따릅니다. 호스트의 JDK·Gradle·PostgreSQL 서버 설치는 필요하지 않습니다.

## 2. 유료 리소스 생성 전 로컬 검증

저장소 루트에서 Docker 엔진을 실행한 뒤 아래 명령을 수행합니다. 스크립트는 호스트의 Bash·OpenSSL·curl·JDK 21의 `jar`를 사용합니다.

```bash
bash server/scripts/verifyDeployment.sh
```

검증은 실제 `.env`, 개발 DB·Redis, AWS 계정이나 카카오 API를 사용하지 않습니다. 실행마다 임시 키·로컬 CA·고유한 Compose 프로젝트를 생성합니다. PostgreSQL 17과 운영 Redis·Nginx·API 이미지를 연결하고 다음을 확인합니다.

- 새 DB의 Flyway 적용·JPA 초기화, 실제 TLS DB 연결과 준비 상태
- API의 비루트 실행, 운영 JAR의 로컬 전용 설정 제외
- 로컬 CA를 신뢰한 HTTPS 연결, 인증된 업무 경로 보호·Actuator 상세 경로 차단
- HTTP 인증 경로·HTTPS 전환·최초 발급용 HTTP 설정 전환
- Redis 재생성 후 AOF 데이터 유지, 장애 시 상세 없는 503과 재연결
- API 재생성 후 Nginx의 DNS 재조회, Nginx 설정 검사·reload

종료 시 자신이 만든 컨테이너·네트워크·볼륨·임시 인증서만 삭제합니다. 빌드한 `moahome-api:local-check` 이미지와 Docker 빌드 캐시는 다음 검증에 재사용합니다. 이미지를 다시 빌드해야 하는 변경이 없을 때만 아래 단축 명령을 사용합니다.

```bash
SMOKE_SKIP_BUILD=1 bash server/scripts/verifyDeployment.sh
```

실제 Let's Encrypt 발급·갱신, AWS 피어링·RDS, Vercel·카카오 연동과 GitHub에서의 실행은 별도 확인 항목입니다. 로컬 검증 결과로 외부 서비스 연결까지 완료됐다고 판단하지 않습니다. 운영용 Compose를 로컬에서 그대로 실행해 개발 서비스의 포트나 데이터를 공유하지 않습니다.

## 3. GitHub Actions의 검증·이미지 게시

Server 변경 PR에서는 JDK 21·Redis·PostgreSQL 17 실행 파일을 준비하고 `./gradlew build`와 위 Docker 통합 검증을 수행합니다. 임시 클러스터를 직접 실행하는 기존 테스트 구조를 유지하며 운영·개발 DB를 연결하지 않습니다.

main 브랜치의 변경은 같은 검증을 통과한 이미지에 아래 태그를 붙여 GHCR로 게시합니다. Ubuntu x64 러너에서 빌드하므로 초기 Lightsail x86_64 서버에 사용할 수 있습니다. 로컬 Mac의 ARM 이미지를 운영 이미지로 게시하지 않습니다.

```text
ghcr.io/<소문자 GitHub 소유자>/moahome-api:<전체 커밋 SHA>
```

게시에는 워크플로의 `GITHUB_TOKEN`과 `packages: write`를 사용합니다. PR과 수동 워크플로 실행에서는 이미지 게시를 수행하지 않습니다. 저장소·조직에서 Actions와 패키지 게시 권한을 허용해야 합니다. workflow 파일 작성만으로 저장소 설정이나 원격 패키지가 생성되지는 않습니다.

## 4. 운영 호스트 준비

공통 계획의 AWS 네트워크와 비공개 RDS 연결을 먼저 완료합니다. 아래 경로는 모아홈 전용 Ubuntu 서버를 기준으로 하며 운영 명령은 해당 서버에서 실행합니다.

1. `/opt/moahome`을 만들고 `server/deploy/`의 파일을 SSH로 복사합니다. 서버에 이미 있는 `.env.prod`, `.deploy.env`, 인증서·데이터를 덮어쓰지 않습니다.
2. Docker·Compose를 설치하고 호스트에 Certbot을 준비합니다.
3. `.env.example`을 `.env.prod`로, `deploy.env.example`을 `.deploy.env`로 복사합니다.
4. 실제 도메인·검증된 GHCR 이미지와 앱 환경변수를 입력합니다. `example.com`, `RDS_ENDPOINT`, `COMMIT_SHA`는 실제 값으로 바꿉니다.
5. RDS CA를 내려받고 비공개 DB의 TLS 인증서 검증·앱 계정 권한을 확인합니다.

```bash
sudo apt-get update
sudo apt-get install -y certbot
cd /opt/moahome
cp .env.example .env.prod
cp deploy.env.example .deploy.env
chmod 600 .env.prod .deploy.env
mkdir -p certs
curl -fsSL https://truststore.pki.rds.amazonaws.com/ap-northeast-2/ap-northeast-2-bundle.pem -o certs/rds-ca.pem
chmod 644 certs/rds-ca.pem
```

위 복사는 최초 준비 때만 수행합니다. 앱 환경 파일은 Compose raw 형식으로 읽으므로 값을 따옴표로 감싸지 않고 셸에서 `source`하지 않습니다. 필수 키 목록·생성·교체 방식은 [개발 가이드](../../docs/developmentGuide.md#server-환경변수)를 참조합니다. 실제 값을 명령줄·Git·로그에 넣지 않습니다.

Redis·Nginx는 로컬 검증에 사용한 digest를 양식과 Compose 기본값에 고정했습니다. 버전을 올릴 때 두 위치를 함께 갱신하고 로컬 통합 검증을 다시 수행합니다. RDS CA는 컨테이너의 비루트 사용자가 읽을 수 있어야 하며 암호화 키·개인키와 달리 공개 인증서입니다.

비공개 GHCR 이미지는 패키지 읽기 권한만 가진 토큰을 사용해 `sudo docker login ghcr.io --username <계정> --password-stdin`으로 로그인합니다. 토큰은 표준입력으로 전달하고 명령 인자로 적지 않습니다. Docker 자격 증명 파일의 권한·토큰 만료도 관리합니다.

## 5. Nginx 최초 인증서와 자동 갱신

API 도메인의 A 레코드와 공개 TCP 80·443 연결이 준비된 상태에서 실행합니다. 아직 인증서가 없어도 HTTP 전용 Nginx부터 실행할 수 있습니다.

```bash
cd /opt/moahome
sudo bash certificates.sh issue <인증서-연락-이메일>
```

스크립트는 HTTP 설정 실행 → Certbot webroot 발급 → HTTPS 설정으로 Nginx 재생성 순서로 처리합니다. 인증서와 challenge는 호스트에 보존하고 Nginx에는 읽기 전용으로 연결합니다. 실패하면 HTTPS 전환을 계속하지 않으므로 도메인·방화벽·Certbot 로그를 확인하고 재실행합니다.

최초 발급에서 갱신 성공 hook도 저장합니다. 갱신 시 Nginx 설정 검사와 reload가 실행되며, 인증서 파일만 바뀌고 서비스는 이전 인증서를 계속 사용하는 상태를 방지합니다.

```bash
sudo install -m 644 moahomeCertbot.service moahomeCertbot.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now moahomeCertbot.timer
sudo systemctl list-timers moahomeCertbot.timer
```

전용 타이머는 `/opt/moahome` 경로를 기준으로 합니다. 경로를 변경하면 unit과 hook 경로도 함께 맞춥니다. 패키지 기본 타이머와 함께 실행되더라도 저장한 deploy hook이 적용되며 Certbot의 잠금으로 동일 인증서의 동시 갱신을 막습니다.

실제 도메인으로 바꾼 뒤 갱신 모의 실행과 hook을 확인합니다.

```bash
sudo certbot renew --cert-name api.example.com --dry-run --run-deploy-hooks
sudo journalctl -u moahomeCertbot.service --no-pager -n 30
```

## 6. API 배포와 복구

HTTPS 준비와 DB 설정을 마친 뒤 전체 이미지 참조를 지정합니다.

```bash
cd /opt/moahome
sudo bash deploy.sh ghcr.io/your-owner/moahome-api:COMMIT_SHA
```

스크립트는 설정 검사 → API 이미지 pull → Redis 준비 확인 → API 교체·준비 확인 → Nginx 검사·reload 순서로 실행합니다. 동시에 두 배포를 실행하지 않도록 잠그고, 성공한 설정은 `.deploy.env`, 직전 정상 설정은 `.previousDeploy.env`에 보관합니다. 일반 API 배포에서는 Redis·Nginx 이미지를 pull하지 않습니다. 운영 파일 자체를 변경하는 배포는 별도로 검토합니다.

실패한 API의 Flyway가 이미 DB를 변경했을 수 있으므로 자동 롤백하지 않습니다. 실패 시 실행 중인 컨테이너가 시도한 버전일 수 있으며, `.deploy.env`는 마지막 정상 확인 버전을 유지합니다. 실제 이미지·로그·DB 스키마를 확인하고 이전 앱과 호환될 때만 이전 이미지로 같은 배포 명령을 실행합니다. DB를 복원해야 하면 [공통 복구 기준](../../docs/deploymentPlan.md#7-백업복구와-관측)을 따릅니다.

```bash
sudo docker compose --env-file .deploy.env -f compose.prod.yml ps
sudo docker compose --env-file .deploy.env -f compose.prod.yml logs --tail=100 api
curl --fail --silent --show-error https://api.example.com/actuator/health/readiness
```

정상 준비 응답은 `200 {"status":"UP"}`이고, 저장소 장애는 상세 없이 `503 {"status":"DOWN"}`입니다. 그다음 실제 로그인과 변경된 업무 흐름을 확인해야 배포가 완료됩니다. `/actuator/env` 같은 상세 경로는 Nginx에서 차단하며 API 자체에서도 인증 없이 허용하지 않습니다.

## 7. 현재 검증 범위

2026-10-30 로컬에서 서버 전체 테스트 562개와 Gradle build, 운영 Docker 이미지 빌드, 임시 PostgreSQL 17·Redis 8·Nginx를 연결한 통합 검증을 실행했습니다. Docker 검증은 Mac ARM 환경이며 GitHub Ubuntu x64 실행·GHCR 게시와 실제 AWS/RDS·공인 인증서·카카오 연동은 아직 수행하지 않았습니다. 후속 변경 때 검증 결과를 갱신합니다.
