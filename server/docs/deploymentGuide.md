# Server 운영 배포 가이드

기준일: 2026-11-03. 인프라 구성과 운영 목적은 [공통 배포 계획](../../docs/operations/deploymentPlan.md)을 따릅니다. 이 문서는 배포 파일의 실행법과 서버 검증 결과를 설명합니다. 실제 구축·사용자 검증의 진행 상태와 남은 운영 점검은 [공통 구축 기록](../../docs/operations/deploymentPlan.md#9-비용과-실제-진행-상태)에서 관리합니다.

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
| `server/deploy/retainImages.py` | 외부 검증 성공 후 최근 정상 API 이미지 3개를 로컬·GHCR에 보관 |
| `server/deploy/certificates.sh` | 최초 인증서 발급·갱신·Nginx 재적용 |
| `server/deploy/moahomeCertbot.service`·`.timer` | Ubuntu에서 하루 두 번 인증서 갱신 확인 |
| `server/scripts/verifyDeployment.sh` | 임시 DB·인증서·컨테이너를 사용하는 로컬 통합 검증 |
| `server/scripts/testImageRetention.py` | Docker·GitHub API를 격리한 이미지 정리 안전 조건 검증 |
| `.github/workflows/serverCi.yml` | PR 검증, main 이미지 게시 후 운영 Runner 자동 배포 |

운영 호스트는 Ubuntu LTS, Docker Engine과 Compose 플러그인 2.30 이상, Bash·curl·Certbot·flock·Python 3.10 이상을 사용합니다. Python은 이미지 정리에 표준 라이브러리만 사용하며 별도 패키지를 설치하지 않습니다. Compose의 raw env_file과 준비 대기를 지원하는 버전이 필요합니다. Docker 설치는 [공식 Ubuntu 안내](https://docs.docker.com/engine/install/ubuntu/)를 따릅니다. 호스트의 JDK·Gradle·PostgreSQL 서버 설치는 필요하지 않습니다.

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

## 3. GitHub Actions의 검증·이미지 게시·자동 배포

Server 변경 PR에서는 JDK 21·Redis·PostgreSQL 17 실행 파일을 준비하고 `./gradlew build`, 이미지 정리 안전 조건 테스트와 위 Docker 통합 검증을 수행합니다. 임시 클러스터를 직접 실행하는 기존 테스트 구조를 유지하며 운영·개발 DB를 연결하지 않습니다.

main 브랜치의 변경은 같은 검증을 통과한 이미지에 아래 태그를 붙여 GHCR로 게시합니다. Ubuntu x64 러너에서 빌드하므로 초기 Lightsail x86_64 서버에 사용할 수 있습니다. 로컬 Mac의 ARM 이미지를 운영 이미지로 게시하지 않습니다.

```text
ghcr.io/<소문자 GitHub 소유자>/moahome-api:<전체 커밋 SHA>
```

게시에는 워크플로의 `GITHUB_TOKEN`과 `packages: write`를 사용합니다. PR과 수동 워크플로 실행에서는 이미지 게시를 수행하지 않습니다. 저장소·조직에서 Actions와 패키지 게시 권한을 허용해야 합니다. workflow 파일 작성만으로 저장소 설정이나 원격 패키지가 생성되지는 않습니다.

### 운영 Runner 연결과 자동 배포 (2026-11-03)

사용자 요청으로 `serverCi.yml`에 `needs: verify`인 `deploy` 작업을 추가했습니다. PR·수동 실행은 기존 Ubuntu 실행기에서 검사만 수행하고, `main` push는 테스트·격리 운영 구성 검사·이미지 게시 성공 뒤 운영 서버의 Runner에서 자동 배포합니다. 배포는 게시한 전체 SHA 태그와 함께 반환한 digest를 사용하며 워크플로 요약에 둘 다 기록합니다.

운영 서버에는 저장소 전용 Linux x64 Runner를 `/home/ubuntu/actions-runner` 등 앱 배포 폴더와 분리해 설치합니다. Runner 이름은 기본값을 사용해도 되고 추가 라벨은 `moahome-production`이어야 합니다. 서비스 계정은 `/opt/moahome`의 기존 배포 파일과 Docker에 `sudo -n`으로 접근할 수 있어야 합니다. 파일과 설정 준비는 다음 절을 따르며 Runner 등록만으로 해당 파일이 생성되지는 않습니다. GitHub의 `production` Environment에 승인 규칙을 설정하면 해당 규칙을 통과해야 작업이 실행됩니다.

작업은 해당 저장소의 일회성 `GITHUB_TOKEN`에 `packages: read`만 부여하고 임시 Docker 인증 설정으로 이미지를 내려받습니다. 기존 운영자 로그인과 `.env.prod`는 변경하지 않으며 종료 시 임시 인증 파일을 제거합니다. 실제 기동 이미지 digest, healthy 상태·재시작 0회, 내부 readiness, 외부 HTTPS readiness의 UP, 미인증 사용자 API의 401을 확인합니다. 실패 시 배포 성공으로 기록하지 않고 기존 스크립트처럼 DB 호환성을 모르는 자동 롤백을 수행하지 않습니다.

DB 변경의 전체 이력 대조·격리 업그레이드 시험·백업은 [운영 배포 규칙](../../docs/operations/deploymentRules.md)에 따라 main 반영 전에 완료합니다. 이 작업은 RDS 스냅샷 생성과 기존 프론트의 실제 로그인·업무 검증까지 자동화한 것으로 보지 않습니다. 서버의 배포 파일 동기화와 프론트 배포 대기 연결도 이번 작업에는 포함하지 않습니다. 이 문서의 구현 설명은 운영 Runner에서 실행 성공을 확인한 기록과 구분합니다.

### 성공 이미지 3개 자동 보관

사용자 요청에 따라 **현재 성공 버전과 이전 성공 버전 2개, 서로 다른 API digest 총 3개**를 보관합니다. 새 배포가 성공했다고 그 이미지를 즉시 지우지 않으며, 네 번째 정상 버전이 기록되면 성공 순서가 가장 오래된 버전을 정리합니다. 같은 이미지 재배포나 롤백은 해당 digest를 최신 성공 위치로 옮기며 보관 개수를 중복 사용하지 않습니다.

`serverCi.yml`의 `retain-images` 작업은 `verify`·`deploy` 성공 뒤 운영 Runner에서 실행합니다. `deploy`의 내부·외부 readiness, 실행 digest·healthy·재시작 횟수, 미인증 API의 401 검증을 모두 통과해야 실행됩니다. 실패한 배포에서는 정상 이력을 갱신하거나 기존 롤백 이미지를 삭제하지 않습니다. 실패 이미지 등 사용하지 않는 오래된 API 이미지도 다음 정상 배포의 정리 대상이 될 수 있습니다.

처리는 다음 순서입니다.

1. 저장소를 `persist-credentials: false`로 체크아웃하고 검증한 `server/deploy/retainImages.py`를 `sudo -n python3`로 실행합니다. `/opt/moahome`의 배포 파일이나 환경 파일을 덮어쓰지 않습니다.
2. `deploy.sh`와 같은 `/opt/moahome/.deployment.lock`을 잡고 설정·실행 API가 검증한 digest와 일치하며 정상인지 다시 확인합니다. 검증 뒤 수동 배포 등으로 버전이 바뀌었다면 중단합니다. 정리가 끝날 때까지 다른 정상 배포는 이 잠금을 획득할 수 없습니다.
3. `/opt/moahome/.successfulImages.json`에 최근 성공 digest를 기록합니다. 기존 이미지의 성공 여부를 생성 시각으로 추정하지 않으므로 **도입 후 서로 다른 정상 버전 3개가 쌓이기 전에는 삭제를 보류**합니다. 이 파일을 삭제·수정해 성공 이력을 임의로 재구성하지 않습니다.
4. GHCR 전체 페이지에서 보관할 digest 3개의 존재를 확인한 뒤 로컬 API 이미지를 정리합니다. 모든 실행·중지 컨테이너가 참조하는 이미지와 다른 저장소에 공유된 이미지는 보호하고 강제 삭제는 사용하지 않습니다. Redis·Nginx, 볼륨과 Docker 빌드 캐시는 정리 대상이 아닙니다.
5. GHCR의 `moahome-api` 패키지에서 보관할 digest를 제외한 오래된 전체 커밋 SHA 태그 버전을 삭제합니다. 보관 이미지보다 나중에 게시된 후보, 별도 수동 태그와 태그 없는 OCI 하위 manifest는 제외합니다. 다른 패키지는 건드리지 않습니다.

보관 대상 정상 API 버전은 3개이며, 새 이미지 다운로드 중에는 일시적으로 4개 이상이 필요합니다. 초기 이력 수집 중, 사용 중인 다른 컨테이너·공유 이미지·별도 태그·새 후보 보호 또는 정리 실패 시에도 실제 개수는 3개보다 많을 수 있습니다. 이미지 간 공통 레이어는 공유되므로 표시 용량의 단순 합계와 실제 회수 용량은 다를 수 있습니다.

배포 작업의 토큰은 기존처럼 `packages: read`를 유지하고 정리 작업에만 `packages: write`를 부여합니다. 삭제에는 GHCR 패키지에 대한 저장소의 **Admin 권한**도 필요합니다. `moahome-api` 패키지의 Settings → Manage Actions access에서 이 저장소의 권한을 확인합니다. 워크플로가 게시한 패키지는 기본적으로 저장소에 Admin 역할이 부여되지만 기존 패키지는 실제 설정을 확인해야 합니다. 별도 PAT를 저장하지 않고 작업의 `GITHUB_TOKEN`을 표준입력으로 전달합니다. 권한 기준은 [GitHub 공식 패키지 삭제 안내](https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package#packages-api-support)를 따릅니다.

정리 오류는 `retain-images` 작업 실패로 표시하며 이미 정상 동작하는 API를 되돌리지 않습니다. 성공 이력은 보존하여 다음 정상 배포에서 다시 정리합니다. 이력 파일 손상·누락된 정상 이미지·권한·네트워크 오류는 로그를 확인하고 해결합니다. GHCR 조회·보관 이미지 확인이 실패하면 로컬 삭제도 시작하지 않으며, 삭제 도중 실패하면 일부 오래된 이미지가 남을 수 있습니다. 실제 운영에서의 권한 확인과 정리 실행 결과는 코드 구현과 구분합니다.

안전 조건 테스트는 저장소 루트에서 실행합니다. 실제 Docker 삭제나 GHCR 접근은 수행하지 않습니다.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s server/scripts -p 'testImageRetention.py'
```

이 자동 정리는 GitHub Actions 배포 경로에 연결됩니다. 아래의 수동 `deploy.sh` 실행만으로는 외부 검증 완료를 알 수 없으므로 정리를 수행하지 않습니다. 이미지 보관은 앱 롤백 준비이며 DB Migration을 되돌리는 기능은 아닙니다.

## 4. 운영 호스트 준비

공통 계획의 AWS 네트워크와 비공개 RDS 연결을 먼저 완료합니다. 아래 경로는 모아홈 전용 Ubuntu 서버를 기준으로 하며 운영 명령은 해당 서버에서 실행합니다.

1. `/opt/moahome`을 만들고 `server/deploy/`의 파일을 SSH로 복사합니다. 서버에 이미 있는 `.env.prod`, `.deploy.env`, 인증서·데이터를 덮어쓰지 않습니다.
2. Docker·Compose를 설치하고 호스트에 Certbot을 준비합니다.
3. `.env.example`을 `.env.prod`로, `deploy.env.example`을 `.deploy.env`로 복사합니다.
4. 도메인·앱 환경변수는 [운영 설정 표](../../docs/operations/deploymentPlan.md#4-운영-설정과-비밀값)에 따라 입력합니다. 배포 양식의 도메인을 구매한 `villamoa.kr` 기준으로 바꾸고 `.deploy.env`에 `API_DOMAIN=api.villamoa.kr`을 설정합니다. `RDS_ENDPOINT`, `COMMIT_SHA`는 생성·검증한 실제 값으로 바꿉니다.
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

위 복사는 최초 준비 때만 수행합니다. 앱 환경 파일은 Compose raw 형식으로 읽으므로 값을 따옴표로 감싸지 않고 셸에서 `source`하지 않습니다. 필수 키 목록·생성·교체 방식은 [개발 가이드](../../docs/development/developmentGuide.md#server-환경변수)를 참조합니다. 실제 값을 명령줄·Git·로그에 넣지 않습니다.

Redis·Nginx는 로컬 검증에 사용한 digest를 양식과 Compose 기본값에 고정했습니다. 버전을 올릴 때 두 위치를 함께 갱신하고 로컬 통합 검증을 다시 수행합니다. RDS CA는 컨테이너의 비루트 사용자가 읽을 수 있어야 하며 암호화 키·개인키와 달리 공개 인증서입니다.

비공개 GHCR 이미지는 패키지 읽기 권한만 가진 토큰을 사용해 `sudo docker login ghcr.io --username <계정> --password-stdin`으로 로그인합니다. 토큰은 표준입력으로 전달하고 명령 인자로 적지 않습니다. Docker 자격 증명 파일의 권한·토큰 만료도 관리합니다.

## 5. Nginx 최초 인증서와 자동 갱신

`api.villamoa.kr`의 A 레코드가 Lightsail 고정 공인 IPv4를 가리키고 공개 TCP 80·443 연결이 준비된 상태에서 실행합니다. DNS·Vercel 프론트 연결은 [공통 접속 구성](../../docs/operations/deploymentPlan.md#2-접속-구조와-네트워크)을 따릅니다. 아직 인증서가 없어도 HTTP 전용 Nginx부터 실행할 수 있습니다.

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
sudo systemctl disable --now certbot.timer
sudo systemctl list-timers moahomeCertbot.timer
```

전용 타이머는 `/opt/moahome` 경로를 기준으로 합니다. 경로를 변경하면 unit과 hook 경로도 함께 맞춥니다. 전용 타이머를 활성화한 뒤 패키지 기본 `certbot.timer`를 비활성화해 갱신 확인 경로를 하나로 관리합니다. 패키지의 service·timer 파일은 삭제하지 않습니다. 인증서 설정에 deploy hook이 저장돼 있으므로 기본 Certbot 경로로 갱신해도 hook이 적용되지만, 두 타이머를 함께 운영할 필요는 없습니다.

타이머의 `03,15:00:00`은 별도 시간대 지정 없이 호스트 시간대를 따릅니다. 현재 운영 호스트는 UTC이므로 한국 시간 12시·다음 날 0시가 기준이며, `RandomizedDelaySec=1800`에 의해 최대 30분의 랜덤 지연이 추가됩니다. 앱 컨테이너의 `TZ=Asia/Seoul`은 호스트 타이머 시간대를 변경하지 않습니다. `systemctl is-enabled certbot.timer moahomeCertbot.timer`의 결과가 순서대로 `disabled`, `enabled`인지 확인합니다. `list-timers --all`의 표시 행 수만으로 비활성화 여부를 판단하지 않습니다.

`api.villamoa.kr` 인증서를 실제 발급한 뒤 갱신 모의 실행과 hook을 확인합니다.

```bash
sudo certbot renew --cert-name api.villamoa.kr --dry-run --run-deploy-hooks
sudo journalctl -u moahomeCertbot.service --no-pager -n 30
```

## 6. API 배포와 복구

[운영 배포 규칙](../../docs/operations/deploymentRules.md)의 전체 DB 이력·선행 Migration·후보 이미지 대조와 백업·호환성 검증을 먼저 수행합니다. 이 스크립트는 배포 전에 해당 점검이나 RDS 스냅샷을 자동 실행하지 않습니다. 양쪽 변경은 백엔드 배포·검증 후 프론트엔드를 공개하며, 과거 버전 누락은 [순서 오류 복구 절차](../../docs/operations/deploymentRules.md#6-과거-migration-누락과-배포-실패-대응)를 따릅니다.

HTTPS 준비와 DB 설정, 위 사전 점검을 마친 뒤 전체 이미지 참조를 지정합니다.

```bash
cd /opt/moahome
sudo bash deploy.sh ghcr.io/your-owner/moahome-api:COMMIT_SHA
```

스크립트는 설정 검사 → API 이미지 pull → Redis 준비 확인 → API 교체·준비 확인 → Nginx 검사·reload 순서로 실행합니다. 동시에 두 배포를 실행하지 않도록 잠그고, 성공한 설정은 `.deploy.env`, 직전 정상 설정은 `.previousDeploy.env`에 보관합니다. 일반 API 배포에서는 Redis·Nginx 이미지를 pull하지 않습니다. 운영 파일 자체를 변경하는 배포는 별도로 검토합니다.

실패한 API의 Flyway가 이미 DB를 변경했을 수 있으므로 자동 롤백하지 않습니다. 실패 시 실행 중인 컨테이너가 시도한 버전일 수 있으며, `.deploy.env`는 마지막 정상 확인 버전을 유지합니다. 실제 이미지·로그·DB 스키마를 확인하고 이전 앱과 호환될 때만 이전 이미지로 같은 배포 명령을 실행합니다. DB를 복원해야 하면 [공통 복구 기준](../../docs/operations/deploymentPlan.md#7-백업복구와-관측)을 따릅니다.

```bash
sudo docker compose --env-file .deploy.env -f compose.prod.yml ps
sudo docker compose --env-file .deploy.env -f compose.prod.yml logs --tail=100 api
curl --fail --silent --show-error https://api.villamoa.kr/actuator/health/readiness
```

정상 준비 응답은 `200 {"status":"UP"}`이고, 저장소 장애는 상세 없이 `503 {"status":"DOWN"}`입니다. 그다음 실제 로그인과 변경된 업무 흐름을 확인해야 배포가 완료됩니다. `/actuator/env` 같은 상세 경로는 Nginx에서 차단하며 API 자체에서도 인증 없이 허용하지 않습니다.

## 7. 현재 검증 범위

2026-10-30 로컬에서 서버 전체 테스트 562개와 Gradle build, 운영 Docker 이미지 빌드, 임시 PostgreSQL 17·Redis 8·Nginx를 연결한 통합 검증을 실행했습니다. 당시 Docker 검증은 Mac ARM 환경이었으며 외부 서비스 구축·검증은 다음 날 별도로 진행했습니다.

2026-10-31 검증 결과는 다음과 같습니다.

- `gradle-wrapper.jar` 누락으로 실패한 CI를 `150e99ab45546b5a44634ba0e66d296763cd4eec` 커밋에서 수정했습니다. 개발 환경 파일을 제외한 임시 체크아웃의 Java 21 Gradle build와 테스트 562개가 모두 통과했습니다.
- 해당 main push의 [Server CI 실행](https://github.com/Moahome/moahome/actions/runs/41169719413)에서 Ubuntu x64 빌드·테스트, 운영 컨테이너 검증과 GHCR 이미지 게시가 모두 성공했습니다.
- 운영에서 확인한 API 이미지는 `ghcr.io/moahome/moahome-api:150e99ab45546b5a44634ba0e66d296763cd4eec`입니다. API·Redis·Nginx 컨테이너가 모두 healthy였고, API의 8080과 Redis의 6379는 호스트 공개 포트에 바인딩되지 않았습니다.
- 운영 RDS PostgreSQL 17.11에 Flyway Migration 51개가 적용됐고 최종 버전은 `20261025080504`입니다. JPA 초기화와 Spring Boot 기동 로그, 외부 HTTPS readiness의 `HTTP 200 {"status":"UP"}`를 직접 확인했습니다.
- 최초 공인 인증서는 `api.villamoa.kr`에 발급됐고 당시 만료일은 2027-01-29였습니다. HTTP 308 전환·HTTPS 검증과 `certbot renew --dry-run --run-deploy-hooks`의 갱신·Nginx reload 성공, 전용 타이머 활성화·기본 타이머 비활성화를 확인했습니다.

Vercel·실제 카카오 로그인·업무 수동 검증에 대한 사용자 확인과 아직 수행하지 않은 백업·복구·운영 점검은 [공통 구축 기록](../../docs/operations/deploymentPlan.md#9-비용과-실제-진행-상태)을 따릅니다. 위 초기 배포 결과만으로 복원·재시작·장애 대응까지 검증한 것으로 기록하지 않습니다.
