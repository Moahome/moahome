# 운영 배포 규칙

기준일: 2026-11-03. 최초 배포와 이후 기능 배포에서 **DB 변경 확인 → 백엔드 배포·검증 → 프론트엔드 배포·검증** 순서를 지킵니다. DB 변경은 현재 구조대로 백엔드 시작 시 Flyway가 적용합니다. 별도 DB 배포 도구가 구현됐다는 의미는 아닙니다.

이 문서는 사용자가 요청한 배포 순서와 Migration 누락 방지 기준을 운영 절차로 정리합니다. 인프라 구성·구축 이력은 [배포 계획](deploymentPlan.md), 서버 준비·실행 명령은 [Server 배포 가이드](../../server/docs/deploymentGuide.md), Migration 작성 규칙은 [Server 규칙](../../server/AGENTS.md#flyway-migration)을 참조합니다. 실제 운영 호스트와 배포 경로는 배포 때 확인하며, EC2 이관 완료나 원격 설정 변경을 이 문서 작성만으로 확정하지 않습니다.

## 1. 배포 순서와 중단 기준

| 단계 | 진행 조건 | 다음 단계로 넘어가지 않는 경우 |
| --- | --- | --- |
| 배포 준비 | 대상 커밋·이미지·이전 정상 버전, 관련 CI 결과, DB 적용 계획과 복구 방법 확인 | 실패·미실행 검사, 불명확한 산출물, 누락된 선행 변경 |
| DB 변경 준비 | 전체 적용 이력과 대상 Migration 비교, 호환성·잠금·데이터 보정 검토, DB 변경 전 백업 완료 | 과거 버전 누락, 체크섬 불일치, 중복 버전, 검증하지 않은 변경 |
| 백엔드 배포 | 검증한 이미지로 배포하고 Flyway·JPA·readiness·기존 프론트 동작 확인 | 배포 실패, 재시작 반복, 인증·조회 오류 |
| 프론트엔드 배포 | 필요한 백엔드 API가 운영에서 정상이며 해당 Client CI가 통과 | API가 아직 없거나 계약 불일치, 배포 대기 조건 미충족 |
| 배포 완료 | 실제 배포 버전과 DB 결과, 외부 HTTPS·로그인·변경 업무 확인 및 기록 | 임시 복구 설정 잔존, 미확인 업무·오류 |

- 프론트엔드만 변경하고 운영 API가 이미 요구 계약을 제공하면 백엔드를 불필요하게 재배포하지 않습니다. 백엔드만 변경하면 기존 프론트와의 호환성을 확인합니다.
- 최초 배포도 API·인증 설정·DB 준비를 확인한 뒤 프론트 운영 도메인을 연결합니다. 이후 양쪽 변경도 백엔드 검증이 끝나기 전에 새 프론트를 공개하지 않습니다.
- 새 백엔드는 배포 전의 프론트와 함께 동작해야 합니다. 필드·API·컬럼 제거는 새 구조 추가 → 호환 백엔드 배포 → 프론트 전환 → 기존 사용 종료 확인 → 후속 배포에서 제거 순서로 나눕니다. 열린 브라우저 탭의 이전 코드도 고려합니다.
- 단일 API 교체에서 짧은 중단이 발생할 수 있습니다. 잠금·실행 시간이 긴 변경은 사전 검증한 점검 절차와 시간을 준비합니다. 무중단 배포·자동 점검 모드가 있다고 가정하지 않습니다.

## 2. 현재 배포 경로에서 순서 지키기

현재 저장소의 자동화 범위는 다음과 같습니다. GitHub·Vercel 계정의 실제 활성화 설정은 별도로 확인합니다.

| 구성 | 구현된 동작 | 자동으로 보장하지 않는 것 |
| --- | --- | --- |
| [Server CI](../../.github/workflows/serverCi.yml) | PR·main 검증, main push 성공 시 GHCR 게시 후 운영 Runner에서 digest 기준 API 자동 배포·내부/외부 준비 상태·인증 보호 확인 | 운영 DB 이력 사전 대조·RDS 스냅샷 생성·실제 로그인과 업무 검증 |
| [이미지 자동 보관](../../server/docs/deploymentGuide.md#성공-이미지-3개-자동-보관) | Server CI 배포·외부 검증 성공 후 현재·이전 정상 API 이미지 총 3개를 운영 호스트·GHCR에 보관하고 오래된 버전 정리 | 도입 이전 성공 이력 추정, 수동 배포 후 자동 정리, DB 롤백. 운영 패키지 권한·실행 결과는 별도 확인 |
| [Client CI](../../.github/workflows/clientCi.yml) | 검사·테스트, main push와 `VERCEL_DEPLOY_ENABLED=true` 등 조건 충족 시 Vercel 운영 배포 | 운영 백엔드 배포 완료 대기. 수동 워크플로 실행의 운영 배포도 현재 조건에 포함되지 않음 |
| [deploy.sh](../../server/deploy/deploy.sh) | 동일 호스트 배포 잠금, 이미지 pull, API 준비 확인, Nginx 검사·reload, 정상 설정 기록 | 배포 전 RDS 스냅샷 생성, 별도 Flyway 사전 검증, 실패 시 자동 롤백 |

**현재 기본 절차는 백엔드와 프론트 변경을 나눠 병합·배포하는 것입니다.**

1. 이 문서의 DB 점검·백업을 먼저 마친 뒤 선행 Migration과 백엔드 변경을 병합합니다. 뒤에 배포할 프론트 변경은 아직 main에 병합하지 않습니다.
2. Server CI의 검사·GHCR 게시와 운영 Runner의 `deploy` 작업 성공을 확인합니다. 기존 프론트의 로그인·조회까지 확인합니다. Runner 라벨·권한·경로 준비는 [Server 가이드](../../server/docs/deploymentGuide.md#운영-runner-연결과-자동-배포-2026-11-03)를 따릅니다.
3. 프론트 변경을 병합하고 Client CI 성공 후 선택한 Vercel 경로로 배포합니다. 백엔드만 변경한 커밋으로도 Vercel Git 연동이 배포를 시작하는지 확인합니다. 이 경우에도 새 API가 필요한 프론트 코드가 먼저 포함되면 안 됩니다.

양쪽을 한 커밋에 포함해야 하면 **병합 전에 프론트 운영 공개를 보류할 수 있는 배포 경로를 준비·확인**합니다. GitHub Actions를 사용하면 `production` Environment의 사용 가능한 승인 대기 설정 등으로 Client 배포를 백엔드 검증 뒤에 진행하도록 하고, Vercel Git 자동 배포가 이를 우회하지 않는지 확인합니다. `VERCEL_DEPLOY_ENABLED=false`로 작업을 건너뛰면 나중에 값을 바꾸는 것만으로 이미 건너뛴 배포가 시작되지 않으므로 별도 배포 실행 계획이 필요합니다. 이미 실행 중인 작업도 변수 변경만으로 중단됐다고 판단하지 않습니다.

Vercel Git 연동은 운영 브랜치 병합만으로 운영 배포를 시작할 수 있습니다. GitHub Actions와 Git 연동의 중복 배포를 피하고, 백엔드 준비 전에 운영 도메인이 전환되지 않게 실제 설정을 확인합니다. 단계적 공개를 선택할 때는 [Vercel 공식 배포 전환 안내](https://vercel.com/docs/deployments/promoting-a-deployment)를 따릅니다. Preview 생성은 운영 공개와 구분하고, Preview 앱을 운영 DB·인증에 임의로 연결하지 않습니다.

## 3. Migration 버전과 선행 변경 확인

### 3.1 비교할 자료

배포 직전에 다음 자료를 한 배포 기록에 모읍니다. 예전 장애 때의 최신 버전이나 로컬 DB 상태를 운영의 현재 상태로 재사용하지 않습니다.

- 운영 DB의 전체 `flyway_schema_history`: 버전·스크립트·체크섬·성공 여부
- 배포할 정확한 커밋의 `server/src/main/resources/db/migration/` 목록과 해당 이미지에 실제 포함된 목록
- 아직 병합하지 않은 브랜치·PR의 Migration과 이번 변경이 의존하는 선행 SQL·API

**최신 버전 한 개만 확인하지 않습니다.** 예를 들어 `20261101063843`이 적용돼 있어도 `20261031…` 파일 3개가 누락될 수 있습니다. `installed_rank`는 실행 순서이고 버전 크기가 아니므로 가장 최근 실행 행을 최고 버전으로 간주하지 않습니다.

운영 DB에는 기존에 검증한 TLS 접속 방식으로 연결하고 아래 읽기 전용 SQL을 실행합니다. 초기 구축 전이라 이력 테이블이 없으면 접속 DB·스키마와 실제 빈 DB 여부부터 확인하며 임의로 baseline을 만들지 않습니다. 기본 `public` 이력 테이블 기준이며 별도 Flyway 스키마·테이블을 쓰면 실제 설정에 맞춥니다.

```sql
SELECT installed_rank, version, description, script, checksum, success
FROM public.flyway_schema_history
ORDER BY installed_rank;

SELECT max(version::bigint) AS highest_successful_version
FROM public.flyway_schema_history
WHERE success = true AND version ~ '^[0-9]{14}$';
```

두 번째 쿼리는 이 프로젝트의 UTC 14자리 버전 규칙에 맞는 성공 이력만 수치로 비교합니다. 첫 번째 전체 목록과 함께 확인하며, 실패 이력이나 다른 형식의 버전이 보이면 원인을 확인할 때까지 중단합니다.

검증한 후보 커밋의 체크아웃에서 파일 목록을 확인합니다. 아래는 저장소 루트에서 실행합니다.

```bash
git rev-parse HEAD
git status --short
rg --files server/src/main/resources/db/migration -g 'V*.sql' | sort
```

작업 중인 소스 목록을 그대로 배포 이미지의 내용으로 간주하지 않습니다. 전체 SHA·CI 게시 결과와 이미지에 포함된 JAR의 Migration 목록을 대조하고, DB 이력과의 이름·체크섬 검증은 격리된 업그레이드 시험에서 Flyway로 확인합니다. Flyway 체크섬 대신 SQL 파일의 일반 해시를 DB 체크섬과 비교하지 않습니다.

### 3.2 비교 결과에 따른 처리

| 확인 결과 | 처리 |
| --- | --- |
| 미적용 후보가 모두 운영 최고 성공 버전보다 큼 | 선행 파일과 의존 관계를 확인하고 버전 오름차순의 적용 목록 작성 |
| 먼저 작성한 낮은 버전이 아직 미병합·미적용 | 높은 버전 배포를 보류하고 선행 변경을 먼저 병합·검증. 같은 이미지에 모두 포함되면 Flyway가 낮은 버전부터 적용 |
| 미적용 후보 중 운영 최고 성공 버전보다 낮은 버전이 있음 | 일반 배포 중단. 이미 높은 버전이 적용된 상태이므로 [순서 오류 복구](#6-과거-migration-누락과-배포-실패-대응) 절차 적용 |
| 적용 이력의 파일이 후보 이미지에 없거나 이름·체크섬이 다름 | 잘못된 브랜치·이미지·과거 파일 변경 여부 확인. 원본 복원 또는 후속 Migration으로 해결 |
| 같은 버전 파일이 둘 이상이거나 선행 SQL이 없음 | 병합·배포 중단. 아직 공유·적용하지 않은 새 파일만 작성 규칙에 따라 조정하고 재검증 |
| 변경이 없음 | Flyway 검증과 앱 호환성을 확인하고 백엔드 변경 범위에 맞게 배포 |

"먼저 있는 버전부터 한다"는 것은 숫자만 보고 과거 앱 이미지를 무조건 실행하는 뜻이 아닙니다. 선행 Migration과 그 스키마에 맞는 앱을 함께 검증합니다. 여러 미적용 Migration을 한 이미지로 배포해도 되며, 높은 버전의 SQL이 낮은 버전보다 먼저 실행되도록 파일을 빼거나 target으로 누락을 숨기지 않습니다.

새 파일의 버전은 작성 시점 UTC를 사용하고 병합 직전 다시 점검합니다. 의존하는 변경이 아직 병합되지 않았으면 먼저 병합합니다. 로컬·개발 DB라도 이미 적용했거나 공유한 파일은 운영에서 미적용이라는 이유로 이름·내용을 바꾸지 않습니다. 파일만 바꿔도 기존 Docker 이미지에는 반영되지 않습니다.

## 4. 배포 전 검증과 백업

- 변경 영역의 필수 검사·빌드가 해당 후보 커밋에서 통과해야 합니다. Server·Client 명령은 각 영역의 [Server 검증 규칙](../../server/AGENTS.md#16-test--build)·[Client 검증 규칙](../../client/AGENTS.md#9-test--build)을 따릅니다. 후보를 바꾸면 영향받는 검증과 DB 대조를 다시 수행합니다.
- DB 변경은 빈 PostgreSQL DB의 전체 적용과 **현재 운영의 스키마·이력에서 후보 버전으로 올리는 경우**를 모두 격리 환경에서 검증합니다. 빈 DB 테스트 통과만으로 이번과 같은 중간 누락을 발견했다고 보지 않습니다. 필요한 경우 보호된 복원 DB를 사용하고 개인정보·복호화 키를 일반 CI나 로그에 노출하지 않습니다.
- 기존 데이터에 대한 NOT NULL·CHECK·UNIQUE·FK 충돌, 데이터 보정 결과, 트리거·함수 덮어쓰기, 잠금·예상 소요 시간과 실패 후 재실행 조건을 확인합니다. 이전 앱과 새 스키마의 호환성도 검증합니다.
- DB 변경 배포 전에 RDS 수동 스냅샷의 생성 완료를 확인하고 식별자·시각·복원 방법을 기록합니다. 자동 백업·PITR의 실제 복원 가능 범위도 확인합니다. 백업 생성과 복원 시험 완료를 구분합니다. 상세 기준은 [백업·복구 기준](deploymentPlan.md#7-백업복구와-관측)을 따릅니다.
- 운영 DB에 새 앱을 하나 더 실행해서 "사전 검증만" 하지 않습니다. 앱 시작은 Flyway뿐 아니라 자동 부과 등 쓰기를 실행할 수 있습니다. 운영 연결 전 시험은 격리하고, 별도 Migration 전용 실행이 필요하면 검증된 도구·절차를 먼저 마련합니다. 현재 `./gradlew flywayMigrate` 태스크는 없습니다.
- 운영 기본값은 `outOfOrder=false`입니다. 복구 때 사용한 `SPRING_FLYWAY_OUTOFORDER=true`나 같은 효과의 명령 인자·설정이 남아 있으면 일반 배포 전에 확인·정리합니다. 정상 배포에서 검증 비활성화·누락 무시로 문제를 숨기지 않습니다.

## 5. 실행과 완료 확인

DB 사전 점검을 통과한 뒤 [Server 배포 명령](../../server/docs/deploymentGuide.md#6-api-배포와-복구)으로 백엔드를 먼저 배포합니다. 아래 예시의 `COMMIT_SHA`는 검증한 전체 커밋 SHA로 바꿉니다. 배포 대상과 이전 정상 이미지의 전체 참조·digest를 기록하며 `latest`나 짧은 SHA만으로 대상을 정하지 않습니다.

```bash
cd /opt/moahome
sudo bash deploy.sh ghcr.io/moahome/moahome-api:COMMIT_SHA
```

배포 스크립트의 `API 준비 확인 완료`는 API 준비 확인 결과입니다. 뒤의 외부 HTTPS·실제 업무 확인까지 끝나야 다음 단계로 넘어갑니다. SSH 터미널에서 다음을 실행합니다. `psql`의 `moahome=>` 화면이라면 먼저 `\q`로 나옵니다.

GitHub Actions 배포에서는 자동 외부 검증까지 통과한 뒤 이미지 정리를 수행합니다. 사용자 요청인 정상 이미지 3개 보관 기준과 초기 이력 수집·삭제 제외·오류 처리는 [Server 이미지 보관 절차](../../server/docs/deploymentGuide.md#성공-이미지-3개-자동-보관)를 따릅니다. `retain-images` 실패는 정리 실패이며 이미 정상 검증된 API를 자동 롤백하지 않습니다. 이미지 3개 보관으로 DB 호환성·백업 점검을 대체하지 않습니다.

```bash
sudo docker compose --env-file .deploy.env -f compose.prod.yml ps
api_container_id=$(sudo docker compose --env-file .deploy.env -f compose.prod.yml ps --all --quiet api)
sudo docker inspect "$api_container_id" --format 'image={{.Config.Image}} imageId={{.Image}} restarts={{.RestartCount}} status={{.State.Status}}'
sudo docker compose --env-file .deploy.env -f compose.prod.yml logs --tail=200 --timestamps api
sudo docker compose --env-file .deploy.env -f compose.prod.yml exec -T api curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/actuator/health/readiness
curl --fail --silent --show-error --max-time 10 https://api.villamoa.kr/actuator/health/readiness
```

| 확인 대상 | 통과 기준 |
| --- | --- |
| 실행 이미지 | 실제 컨테이너가 후보 전체 SHA·digest와 일치. 마지막 정상 설정 파일만 보고 판단하지 않음 |
| 컨테이너 | API·Redis·Nginx가 healthy이고 API가 재시작을 반복하지 않음 |
| 기동 로그 | Flyway 검증·예상 목록 적용 성공, JPA 초기화와 `Started ServerApplication` 확인 |
| DB 이력 | 예상 Migration이 모두 `success = t`. 변경이 없으면 새 적용 없음 |
| 내부·외부 readiness | 각각 HTTP 200, `{"status":"UP"}`. 내부 성공만으로 DNS·TLS·프록시 통과를 대신하지 않음 |
| 기존 프론트 | `https://villamoa.kr`에서 로그인·관리대상 선택·기존 목록 조회 정상 |

백엔드 통과 후 프론트를 배포하고 Vercel의 운영 대상 커밋·배포 ID와 운영 도메인 연결을 확인합니다. 실제 브라우저에서 새로고침·로그아웃 후 로그인·주요 목록과 이번에 바뀐 업무를 확인합니다. 데이터 변경 검증이 필요하면 검증용 대상·내용·취소 방법을 사전에 정하고, 실제 주민 자료나 금액을 임의로 변경하지 않습니다. 오류·권한·주요 합계를 확인한 결과를 배포 기록에 남깁니다.

## 6. 과거 Migration 누락과 배포 실패 대응

### 6.1 높은 버전이 이미 적용된 뒤 낮은 버전이 발견된 경우

2026-11-03 제공 로그와 SQL 조회에서는 `20261101063843`까지 적용된 DB에 누락돼 있던 `20261031065016`, `20261031071757`, `20261031073149`의 순서 외 적용 성공과 각각 `success = t`를 확인했습니다. 제공 로그에는 서버 기동 성공도 있습니다. 이 근거만으로 임시 설정 제거 후 재배포·외부 로그인까지 확인했다고 기록하지 않습니다. 이 버전들은 장애 사례이며 이후 배포의 고정 기준이 아닙니다.

1. 일반 배포와 후속 프론트 공개를 중단하고 전체 이력·실제 실행 이미지·오류를 확보합니다. 낮은 버전이라도 나중에 적용하면 후속 함수·제약·데이터 보정을 덮어쓸 수 있으므로 바로 실행하지 않습니다.
2. 현재 스키마에서 누락 SQL을 나중에 실행해도 되는지, 후보의 **전체 미적용 목록**과 기존 데이터 영향을 격리 DB에서 재현합니다. 필요한 경우 원본을 유지한 후속 보정 Migration까지 검증합니다. 순서와 호환성을 보장할 수 없으면 운영 적용을 보류합니다.
3. DB 백업·복구 계획과 실행할 후보 이미지를 확인한 뒤 복구 배포에 한해 `outOfOrder`를 임시 허용합니다. Spring Boot 앱에서는 `/opt/moahome/.env.prod`의 `SPRING_FLYWAY_OUTOFORDER=true`를 사용합니다. `.deploy.env`에 추가하거나 셸에서 export만 하면 앱 컨테이너에 주입된다고 가정하지 않습니다. 기본 `APP_ENV_FILE`을 바꾼 환경은 실제 앱 환경 파일을 확인합니다.
4. 검증한 이미지로 `deploy.sh`를 실행하고 예상한 SQL만 성공했는지 로그와 전체 이력을 확인합니다. 이 옵션은 특정 3개만 선택하는 기능이 아니므로 예기치 않은 Migration까지 적용되지 않게 후보를 확인해야 합니다.
5. 성공하면 임시 줄을 삭제하고 같은 검증 이미지로 다시 배포합니다. 환경변수 변경은 `docker compose restart`만으로 반영되지 않으므로 컨테이너 재생성을 확인합니다. 일반 설정으로 Flyway 검증·기동·내부·외부 readiness·실제 로그인·업무 확인까지 통과한 뒤 복구 완료로 기록합니다.

[Flyway outOfOrder 공식 설명](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-out-of-order-setting)과 [Spring Boot 환경변수 변환 규칙](https://docs.spring.io/spring-boot/reference/features/external-config.html)을 참고합니다. Flyway CLI의 `FLYWAY_OUT_OF_ORDER`와 Spring Boot 앱의 환경변수 이름을 혼용하지 않습니다. 컨테이너 재시작의 설정 반영 범위는 [Docker 공식 안내](https://docs.docker.com/reference/cli/docker/compose/restart/)를 따릅니다.

### 6.2 API 배포나 Migration 자체가 실패한 경우

- 프론트 배포를 진행하지 않고 마지막 예외, 실패 SQL·버전, 잠금·연결 상태와 실제 적용 이력을 확인합니다. PostgreSQL의 트랜잭션 처리만 믿고 모든 변경이 취소됐다고 가정하지 않습니다.
- 실패한 배포는 `.deploy.env`를 갱신하지 않았어도 실행 중인 컨테이너를 이미 바꿨을 수 있습니다. [Server 복구 절차](../../server/docs/deploymentGuide.md#6-api-배포와-복구)에 따라 실제 이미지와 DB 상태를 확인합니다.
- 이전 이미지 복귀는 현재 DB·업무 데이터와의 호환성을 확인한 경우에만 진행합니다. 이미 성공한 Migration을 자동 취소하거나 이전 이미지를 무조건 실행하지 않습니다. `.previousDeploy.env`는 DB 백업이 아닙니다.
- 호환성이 없으면 검증한 후속 수정 배포 또는 [DB 복구 절차](deploymentPlan.md#7-백업복구와-관측)를 선택합니다. DB 복원은 이후 정상 거래의 유실·정합성 영향을 확인하고 업무 쓰기를 통제한 뒤 별도 복원 DB에서 검증합니다.
- 운영 `flyway clean`, 이력 행 삭제·직접 수정, 이미 공유·적용된 SQL의 이름·내용 변경으로 오류를 우회하지 않습니다. `repair`도 누락 SQL을 실행하는 명령이 아니며, 원인 검토 없이 검증을 통과시키는 용도로 사용하지 않습니다.

## 7. 배포 기록과 자동화 후속 항목

배포마다 다음 양식을 보호된 운영 기록에 채웁니다. Secret·Token·환경 파일 원문·주민 개인정보는 적지 않습니다. 이 문서에는 절차만 유지하고 매번 실제 운영 값이나 성공 여부를 덮어쓰지 않습니다.

```text
배포 일시(KST) / 실행자:
배포 내용 / 검증한 Server·Client 커밋:
이전 정상 API 이미지 / 후보 이미지(전체 SHA·digest):
운영 최고 성공 DB 버전 / 전체 이력 대조 결과:
적용 예정 Migration(낮은 버전부터) / 실제 적용 결과:
선행 PR·Migration / 미해결 항목:
CI·격리 업그레이드·호환성 검증 근거:
DB 변경 시 스냅샷 식별자·완료 시각 / 복구 방법:
백엔드 배포·기존 프론트 확인 결과:
프론트 공개 보류 방식 / 실제 배포 ID·커밋:
외부 HTTPS·로그인·변경 업무 확인 결과:
임시 설정 제거·일반 설정 재검증 결과:
최종 상태 / 미확인 항목 / 장애 시 조치:
```

현재 이 문서는 운영자가 수행할 기준입니다. 다음 항목은 **자동화 제안이며 이번 문서 변경으로 구현되지 않았습니다.**

- PR에서 중복 버전·적용된 파일 변경·병합 순서를 검사하고, 배포 후보의 Migration 목록을 산출물로 기록
- 보호된 배포 단계에서 실제 운영 전체 이력과 후보를 대조하고, 누락·체크섬·선행 버전 문제를 API 교체 전에 차단. 운영 DB 자격 증명을 PR CI에 배포하지 않음
- 백엔드 운영 검증이 끝나야 프론트 공개를 허용하는 배포 단계 연결, 스냅샷 완료 확인과 배포 기록 자동 수집

이 항목이 구현·검증되기 전까지 CI 성공이나 문서 추가만으로 운영 Migration 순서와 양쪽 배포 순서가 자동 보장된다고 보고하지 않습니다.
