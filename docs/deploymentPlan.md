# 초기 운영 배포 계획

기준일: 2026-10-30. 본인 빌라에서 사용할 모아홈의 초기 운영 환경과 구축 순서를 정리합니다.

이 문서는 구축 계획입니다. AWS 리소스 생성, 운영 설정 파일 작성, GitHub Actions 연결이나 실서비스 배포가 완료됐다는 의미는 아닙니다. 로컬 실행은 [개발 환경 가이드](developmentGuide.md), 인증은 [JWT 인증 설계](securityDesign.md), 업무 데이터와 저장 구조는 [도메인 규칙](domainRules.md)·[ERD](erd.md)를 따릅니다.

## 1. 운영 목적과 구성

사용자는 우선 본인 빌라에서 무보수로 사용하며 실제 주민 정보와 관리비·거래내역을 저장합니다. 현재 다른 관리소장에게 판매하거나 서비스 이용료를 받을 계획은 없습니다.

사용자와 정한 초기 구성은 Lightsail 4GB, RDS PostgreSQL, Docker Redis, GitHub Actions입니다. 웹 서버는 Nginx를 사용합니다. 아래 세부 사양과 절차는 이 구성을 구체화한 초기 구현안이며 업무 정책을 추가로 확정하지 않습니다.

| 영역 | 초기 구축안 |
| --- | --- |
| AWS 리전 | 서울 `ap-northeast-2` |
| API 서버 | Lightsail Ubuntu LTS, RAM 4GB, 고정 공인 IPv4 |
| 백엔드 | Java 21·Spring Boot, Docker 컨테이너 |
| DB | RDS PostgreSQL 17, Single-AZ, `db.t4g.micro`·gp3 20GiB부터 검토 |
| Redis | Lightsail 내부 Redis 8 컨테이너, 영속 볼륨·AOF |
| 웹 서버 | Nginx Open Source 컨테이너, HTTPS 종료·API 프록시 |
| 인증서 | Let's Encrypt·Certbot, 자동 갱신·Nginx 재적용 |
| 프론트 | Vercel 별도 배포, Hobby를 우선 검토 |
| 빌드·배포 | GitHub Actions·GHCR·Docker Compose |
| 백업 | RDS 자동 백업 14일, DB 변경 전 수동 스냅샷, Lightsail 자동 스냅샷 |
| 파일 저장소 | 영구 보관 기능이 필요해질 때 비공개 S3 검토 |

RDS 인스턴스 사양과 엔진 버전은 서울 리전의 실제 제공 여부를 확인하고 부하를 측정해 조정합니다. Single-AZ DB와 Lightsail 1대는 단일 장애 지점이 있는 구성입니다. 계획된 배포 중 짧은 서비스 중단을 허용하는 초기 구현안으로 두며 무중단 배포나 자동 장애 전환이 구현됐다고 기록하지 않습니다.

Vercel Hobby의 검토 근거는 개인·비상업적 사용 목적입니다. 주민 데이터의 양이나 낮은 접속량만으로 이용 가능 여부를 판단하지 않으며, 무료 제공만으로 공식 이용 조건 충족을 확정하지 않습니다. 향후 이용 목적·범위가 바뀌면 [Vercel 공식 이용 기준](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)을 다시 확인합니다.

## 2. 접속 구조와 네트워크

`example.com`은 설명용 도메인이며 실제 확보한 도메인으로 교체합니다.

```text
사용자 브라우저
  ├─ HTTPS app.example.com → Vercel / Next.js
  └─ HTTPS api.example.com → Lightsail 고정 공인 IP
                              └─ Nginx :443
                                  └─ Spring Boot :8080 (Docker 내부)
                                      ├─ Redis :6379 (Docker 내부)
                                      └─ RDS PostgreSQL :5432
                                         (VPC Peering·TLS)
```

- 웹과 API는 같은 도메인 아래 HTTPS로 구성해 기존 동일 사이트 쿠키 인증을 유지합니다. 쿠키·CORS·CSRF의 세부 기준은 [인증 설계](securityDesign.md#3-웹-토큰-전달)를 참조합니다.
- Lightsail은 TCP 80·443만 전체에 공개하고 SSH 22는 운영자 IP로 제한합니다. IPv6를 사용하면 방화벽과 DNS도 같은 기준으로 설정합니다.
- Spring Boot 8080과 Redis 6379는 호스트 공개 포트에 바인딩하지 않습니다.
- RDS는 Public access를 `No`로 설정하고, 같은 서울 리전의 기본 VPC에 둡니다. Lightsail의 기본 VPC 피어링은 해당 리전의 기본 VPC를 대상으로 합니다.
- RDS 보안 그룹은 Lightsail 사설 IPv4 `/32`에서 오는 5432 연결만 허용합니다. 피어링 상태와 DB 서브넷의 반환 경로를 함께 확인하고 서버 교체 시 사설 IP 규칙을 갱신합니다.
- DB는 실제 RDS 엔드포인트와 공식 CA 번들로 `sslmode=verify-full` 연결을 검증합니다. CA 파일은 API 컨테이너에 읽기 전용으로 제공합니다.

계정 보안은 루트 MFA와 별도 일상 작업 계정을 사용하고 루트 액세스 키를 생성하지 않습니다. AWS 예산 알림을 설정하되 알림 금액을 청구 상한이나 자동 중단 기능으로 설명하지 않습니다.

## 3. Nginx와 HTTPS 인증서

Nginx가 외부 HTTPS를 받아 Docker 내부의 API로 전달합니다. 인증서는 Certbot으로 발급·자동 갱신하고, 갱신된 인증서를 Nginx에 반영하는 작업까지 구축 범위에 포함합니다.

초기 구현안은 Nginx를 Compose로 실행하고 Certbot은 Ubuntu 호스트에서 실행하는 방식입니다. 컨테이너 Nginx에는 Certbot의 `--nginx` 자동 편집 기능 대신 `webroot` 방식을 사용합니다.

1. API 도메인의 A 레코드를 Lightsail 고정 IP에 연결합니다.
2. Nginx를 HTTP 설정으로 먼저 실행해 `/.well-known/acme-challenge/` 경로를 제공합니다. 최초 발급 전에는 아직 없는 인증서 파일을 HTTPS 설정에서 참조하지 않습니다.
3. 호스트 Certbot과 Nginx 컨테이너에 같은 인증용 웹 디렉터리를 연결하고, Certbot의 `webroot` 방식으로 도메인 인증과 인증서 발급을 수행합니다.
4. Nginx에 `/etc/letsencrypt` 전체를 읽기 전용으로 연결합니다. `live` 아래 파일이 `archive`를 참조하므로 개별 인증서 파일만 마운트하지 않습니다.
5. Nginx 설정 검사 후 HTTPS를 활성화합니다. 인증용 경로를 유지하며 일반 HTTP 요청은 HTTPS로 전환합니다.
6. Certbot 자동 갱신 타이머와 갱신 성공 후 실행할 deploy hook을 구성합니다. Hook은 Nginx 설정 검사 후 인증서를 다시 읽도록 reload합니다.
7. 갱신 모의 실행, hook 실행, 실제 제공 인증서의 유효기간을 각각 확인합니다. 인증서 발급·갱신 실패를 관측합니다.

API 컨테이너 교체 후에도 Nginx가 새 API 주소로 연결되는지 확인합니다. Nginx의 요청 크기·대기시간은 현재 파일 업로드·API 제한과 맞추고, 인증 응답과 개인정보 응답을 프록시 캐시에 저장하지 않습니다.

## 4. 운영 설정과 비밀값

현재 로컬 `application.yml`·`application*.properties`는 Git 추적에서 제외되어 있습니다. GitHub의 새 체크아웃에 로컬 설정이 있다고 가정하지 않습니다. 비밀값 없는 운영 설정과 환경변수 연결을 준비하고, 실제 값은 운영 환경에서 주입합니다. `SPRING_PROFILES_ACTIVE=prod` 지정만으로 운영 설정이 준비됐다고 판단하지 않습니다.

| 설정 영역 | 적용 방향 |
| --- | --- |
| DB 연결 | `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` |
| Redis 연결 | `SPRING_DATA_REDIS_HOST=redis`, `SPRING_DATA_REDIS_PORT=6379` |
| 웹 주소 | `NEXT_PUBLIC_HOST=https://app.example.com` |
| API 주소 | `NEXT_PUBLIC_API_HOST=https://api.example.com` |
| 인증·암호화 | [개발 가이드의 Server 환경변수](developmentGuide.md#server-환경변수)를 기준으로 운영 설정에 연결 |
| Profile·문서 | `prod` 명시, 운영 OpenAPI 비활성화, HTTPS용 쿠키 설정 |
| 스키마 변경 | Flyway 사용, JPA `ddl-auto=validate` 또는 `none`, 운영 `update`·`create` 금지 |

`NEXT_PUBLIC_API_BASE_URL`은 현재 Client에서 읽지 않으므로 사용하지 않습니다. `NEXT_PUBLIC_` 값에는 공개 URL만 넣으며 변경 후 프론트를 다시 빌드합니다. 카카오 콜백과 Client 로그인 복귀 주소는 기존 [설정 계약](developmentGuide.md#카카오-로그인-설정)을 따라 실제 도메인으로 연결합니다.

DB 마스터 계정과 앱 계정을 분리합니다. 초기에는 앱 시작 시 Flyway를 실행하므로 신규 스키마 생성·변경에 필요한 권한과 기존 객체 소유권을 함께 검증합니다. Migration 전용 계정까지 분리할 때는 Flyway 연결과 앱 실행 권한도 분리하며 DML 권한만 준 계정으로 Migration이 실행된다고 가정하지 않습니다.

실제 환경 파일은 서버에서 접근 권한을 제한하고 Git·이미지·빌드 로그에 포함하지 않습니다. Docker 빌드 컨텍스트에서 `.env`뿐 아니라 추적 제외된 로컬 설정·키 파일도 제외합니다. 암호화 키는 배포마다 다시 생성하지 않고, DB 복원에 필요한 기존 키를 서버와 별도의 보호된 위치에도 보관합니다.

## 5. Redis 운영안

Redis는 단순 캐시가 아니라 로그인 세션·OAuth 임시 상태·초대 인증값을 저장합니다. 업무 출처와 Redis의 역할은 [ERD](erd.md#초대-인증의-redis-이전-설계-2026-10-25), 유실 시 기존 처리는 [Server 설계](../server/docs/memberManagement.md#설정과-운영-확인-필요)를 참조합니다.

- 현재 개발 구성과 같은 Redis 8을 기준으로 검증한 이미지 버전을 고정합니다.
- 영속 볼륨에 AOF를 기록하며 초기 동기화 방식은 `appendfsync everysec`로 잡습니다. 비정상 종료 시 최근 쓰기가 유실될 수 있고 AOF가 별도 백업이나 고가용성을 대신하지는 않습니다.
- 인증 키가 메모리 부족으로 임의 축출되지 않도록 `noeviction`을 사용합니다. `maxmemory`는 컨테이너 한도보다 작게 설정하고 AOF 처리·프로세스 오버헤드의 여유를 둡니다. 메모리 부족으로 쓰기가 거부되는 상황도 감시합니다.
- 서버 외부에 Redis를 공개하지 않고 앱만 연결하도록 구성합니다. API 배포 과정에서 Redis 컨테이너를 매번 재생성하거나 전체 볼륨을 삭제하지 않습니다.
- Redis 유실 시 기존 세션은 재로그인하고, 미사용 초대 코드는 명시적으로 재발급합니다. DB에 남은 해시만으로 Redis 검증을 우회하지 않습니다.
- 과거 Redis 백업의 세션을 무조건 복원하지 않습니다. 로그아웃·토큰 교체 상태가 되돌아갈 수 있으므로 장애 복구에서는 현재 인증 상태의 신뢰성을 확인하고, 확인할 수 없으면 세션을 무효화합니다.

## 6. GitHub Actions와 배포 흐름

초기 구현안은 **PR 자동 검증 → main 병합 후 이미지 게시 → 운영자가 서버에서 배포**입니다. SSH를 운영자 IP로 제한한 상태를 유지합니다. 이 단계는 자동 CI·이미지 게시와 수동 운영 배포로 구분하며, 서버 배포까지 자동화됐다고 기록하지 않습니다.

| 시점 | 수행할 작업 |
| --- | --- |
| Client PR | ESLint·TypeScript·빌드와 관련 테스트 |
| Server PR | JDK 21·PostgreSQL 17 이상·Redis 실행 환경 준비 후 Gradle 테스트·빌드 |
| main 병합 | 검증 통과 후 변경 영역의 배포 산출물 생성. Server 이미지는 GHCR에 커밋 SHA 태그로 게시 |
| 프론트 배포 | 검증 통과 후 Vercel CLI로 배포. Vercel Git 자동 배포와 중복 실행 방지 |
| API 배포 | 운영자가 제한된 SSH로 접속해 게시된 이미지 태그·배포 설정 확인 후 API 교체 |
| 배포 확인 | 내부 준비 상태·외부 HTTPS·로그인·관련 업무 동작 확인 |

현재 Server 통합 테스트는 컨테이너 서비스 대신 `redis-server`, `initdb`, `postgres`, `pg_ctl` 프로세스를 직접 실행합니다. 러너에 바이너리와 PATH 또는 지원하는 실행 경로 환경변수를 준비하고, 테스트 전용 설정도 새 체크아웃에서 사용할 수 있게 구성합니다. 개발·운영 DB와 비밀값은 재사용하지 않습니다. 세부 검증 기준은 [Server 규칙](../server/AGENTS.md#16-test--build), [Client 규칙](../client/AGENTS.md#9-test--build)을 따릅니다.

일반 GitHub 호스팅 러너에서 운영자 IP만 허용된 SSH로 바로 접속할 수 있다고 가정하지 않습니다. 향후 서버 배포까지 자동화할 때는 배포 전용 접속 경로와 최소 권한을 먼저 구현합니다. 자동화를 위해 SSH를 전체 인터넷에 공개하거나 PR 코드를 운영 서버에서 직접 실행하지 않습니다.

일반 API 배포는 새 이미지를 먼저 내려받고 API 서비스만 교체해 Redis·Nginx의 불필요한 재시작을 피합니다. 배포를 동시에 실행하지 않으며 이전 정상 이미지와 배포 설정을 보관합니다. Nginx·Redis 이미지는 API 배포와 별도로 버전을 올리고 검증합니다.

컨테이너 실행과 API 준비 완료를 구분합니다. Redis healthcheck와 준비 대기, Actuator의 최소 Health 응답을 작성했습니다. 운영 readiness는 DB·Redis·앱 준비 상태를 확인하고 공개 응답에는 상세 정보를 포함하지 않습니다. 로컬 검증과 실제 운영 연동의 구분은 [Server 배포 가이드](../server/docs/deploymentGuide.md)를 따릅니다. 루트 경로의 401이나 `compose up -d` 성공만으로 배포를 완료 처리하지 않습니다.

Client 워크플로는 `.github/workflows/clientCi.yml`입니다. 기본 검사와 브라우저 테스트는 외부 배포 자격 증명 없이 실행합니다. Vercel 프로젝트의 Root Directory를 `client`로 지정하고 Git 자동 배포를 끈 뒤, GitHub Repository Variables에 `VERCEL_DEPLOY_ENABLED=true`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `production` Environment Secret에 `VERCEL_TOKEN`을 설정하면 main 검증 후 배포합니다. production 환경의 공개 URL도 Vercel에 등록합니다. 배포 명령은 저장소 루트에서 실행하며 새 운영 환경변수로 다시 빌드합니다. 이 연결 전에는 Client CI만 수행합니다.

## 7. 백업·복구와 관측

- RDS 자동 백업은 초기 14일 보존으로 구성하고 DB 변경 배포 전 수동 스냅샷을 생성합니다. 스키마 변경의 호환성·잠금·실행시간과 복구 절차를 확인합니다.
- RDS 복원은 별도 DB 인스턴스에서 검증합니다. 최신 데이터와 격리한 환경에서 업무 자료·암호화 데이터의 조회를 확인한 후 전환 절차를 정합니다.
- 앱 이미지 복구와 DB 복구를 구분합니다. 이전 앱이 새 스키마와 호환되지 않으면 이미지만 되돌리지 않으며, DB를 과거 시점으로 복원하면 그 이후 거래가 유실될 수 있음을 확인합니다.
- Lightsail 자동 스냅샷은 서버 설정 복구용입니다. RDS 백업과 암호화 키 보관을 대체하지 않습니다. 복원한 서버가 운영 DB에 연결돼 자동 부과·쓰기를 시작하지 않도록 격리합니다.
- CPU·메모리·디스크·DB 연결·저장 공간·오류·인증서 만료를 관측합니다. 메모리·디스크 사용률은 기본 Lightsail 지표만으로 수집된다고 가정하지 않고 별도 에이전트 또는 수집 설정을 준비합니다.
- 애플리케이션·Nginx·Docker 로그의 보관량과 회전을 설정합니다. 인증정보·쿠키·초대코드·개인정보 원문·SQL 파라미터가 로그에 남지 않게 합니다.
- 정기 복원 점검을 수행하고 검증용 리소스는 종료 후 정리합니다. 백업 저장량과 복원용 인스턴스도 비용에 포함합니다.

S3 도입만으로 은행 업로드 원본이나 보고서를 영구 저장하도록 업무 정책을 변경하지 않습니다. 현재 주요 Excel·PDF·PNG 출력은 Client에서 수행하므로 모든 파일 생성이 API 서버 부하라고 가정하지 않습니다.

## 8. 구축 순서와 완료 기준

1. AWS 계정 보안·예산 알림을 준비하고 Lightsail 4GB·고정 IP·방화벽을 구성합니다.
2. 비공개 RDS·피어링·보안 그룹을 구성하고 Lightsail에서 TLS 인증서 검증을 포함한 DB 접속을 확인합니다.
3. 비밀값 없는 운영 설정과 테스트 설정을 준비하고 새 체크아웃에서 테스트·운영 이미지 빌드를 검증합니다.
4. Spring Boot·Redis·Nginx의 운영 Compose, Health 확인과 영속 저장을 준비합니다.
5. 도메인·Certbot 최초 인증서 발급·HTTPS 전환·자동 갱신·Nginx 재적용을 검증합니다.
6. Vercel 프론트와 카카오·쿠키·CORS·CSRF를 실제 도메인으로 연결합니다.
7. GitHub Actions의 PR 검증·main 이미지 게시와 운영 배포·이전 버전 복구 절차를 검증합니다.
8. DB 백업·격리 복원·키 복구·지표·로그를 확인하고 실제 사용을 시작합니다.

운영 인수에서는 로그인·재발급·로그아웃, 관리대상별 접근 제한, 세대·주민 등록, 초대, 부과·수납·통장·정산과 파일 출력을 확인합니다. Redis 재시작·유실, API 교체, 잘못된 환경 설정도 확인합니다. 현재 자동 부과는 매시간과 서버 시작 시 누락분을 확인하므로 별도의 월 1회 예제 스케줄러를 추가하지 않고 기존 구현과 중복 방지를 검증합니다.

## 9. 비용과 실제 진행 상태

비용은 서울 리전의 생성 시점 공식 견적을 사용합니다. Lightsail·RDS 컴퓨팅과 스토리지 외에 백업·스냅샷·트래픽·도메인·모니터링·레지스트리·CI 사용량·세금, Vercel 유료 전환 시 비용을 함께 확인합니다. 기존 첨부안의 월 추정치를 확정 청구액이나 비용 상한으로 사용하지 않습니다.

2026-10-30 운영용 Dockerfile·Compose·Nginx·Certbot 스크립트·GitHub Actions·Health 구현과 격리 로컬 검증 스크립트를 작성했습니다. 파일 위치·실행법과 검증 범위는 [Server 배포 가이드](../server/docs/deploymentGuide.md)를 참조합니다. 파일 작성과 로컬 통과를 GitHub 원격 실행·GHCR 게시·Vercel 배포·AWS 리소스 구축 완료로 기록하지 않습니다. 외부 연결 후 실행한 검증과 결과를 추가합니다.

같은 날 Client의 ESLint·TypeScript 타입 검사와 기본 Turbopack 프로덕션 빌드가 통과했습니다. 최종 로컬 전체 검사는 `client/`에서 `PLAYWRIGHT_CHANNEL=chrome npm test -- --workers=2 --reporter=dot,html`로 실행해 617개 모두 통과했습니다(API 프로젝트 121개·Chromium 프로젝트 496개, 실패·중단·미실행 없음). 이전 API 테스트 129개 기록은 최초 전체 검사의 부분 통과 수를 혼동한 것으로 121개로 정정합니다.

현재 요구사항의 PC 초대 모달·모바일 가입 경로, 주민 표시·권한 복귀·공통 오류·로딩을 기준으로 테스트 기대값을 갱신했습니다. 취소된 요청과 완료 응답을 구분하고, 스크롤·소수점 좌표와 단계 전환 완료를 확인하도록 테스트를 수정했습니다. 초기 설정 이동의 일회성 실패는 같은 코드로 10회 반복 통과한 뒤 최종 전체 검사에서도 통과했습니다. 화면·업무 로직 변경 없이 E2E와 검증 환경을 정리한 결과입니다.

개발 서버에서 manifest 읽기 오류와 Fast Refresh 간섭이 확인돼, 브라우저 통합 검사는 테스트 전용 환경변수로 `.next-test/`에 프로덕션 빌드 후 `next start`를 실행하도록 변경했습니다. 기본 worker는 1개이며 위 최종 로컬 검사는 2개로 수행했습니다. 결과 열기·화면 첨부·실패 Trace 보관은 [Client 검증 안내](../client/README.md#검증)를 따릅니다. Client CI는 전체 검사 실패 시 배포하지 않으며 생성된 HTML 보고서·테스트 결과를 성공·실패와 관계없이 7일간 보관하도록 설정했습니다. GitHub 원격 실행은 아직 검증하지 않았으며, 이 로컬 검사는 모의 API·주소 검색 SDK를 사용하므로 실제 카카오·API 서버·DB·Redis 연동과 운영 배포 완료 여부는 별도 확인합니다.

## 참고 자료

- [Lightsail VPC 피어링](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-set-up-vpc-peering-with-aws-resources.html)
- [RDS PostgreSQL TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [Nginx Docker 운영](https://docs.nginx.com/nginx/admin-guide/installing-nginx/installing-nginx-docker/)
- [Certbot webroot·자동 갱신·hook](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [Redis 영속화](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Compose 준비 상태와 시작 순서](https://docs.docker.com/compose/how-tos/startup-order/)
- [GitHub 호스팅 러너](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Vercel GitHub Actions 연동](https://vercel.com/docs/git/vercel-for-github#using-github-actions)
- [Lightsail 메모리·디스크 지표 수집](https://repost.aws/knowledge-center/lightsail-monitor-with-cloudwatch)
