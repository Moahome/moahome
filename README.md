# moahome

모아홈은 소규모 빌라·공동주택의 주민 관리, 관리비 운영과 회계를 연결하는 관리비 통합 플랫폼입니다.
현재 구현 상태와 검토 후보는 [프로젝트 개요](docs/projectOverview.md#4-현재-개발-상태)에서 관리합니다.

## 로컬 API 문서

`server/`에서 API 서버와 별도 Swagger UI를 실행합니다. 환경 준비는 [개발 환경 가이드](docs/developmentGuide.md)를 따릅니다.

```bash
docker compose up -d swagger-ui
./gradlew bootRun
```

- [Swagger UI](http://localhost:4000): 별도 Docker 서비스
- [OpenAPI JSON](http://localhost:8080/v3/api-docs)
- [OpenAPI YAML](http://localhost:8080/v3/api-docs.yaml)

Swagger의 `Authorize`에서 `bearerAuth`에 로그인 후 받은 Access Token만 입력하면 내 정보 조회와 관리대상 등록을 호출할 수 있습니다. 인증 입력은 새로고침 후 유지하지 않습니다. 등록 예시는 가상 정보이며, 최종 등록 호출은 실제로 개발 DB에 저장됩니다. 서로 다른 등록에는 새 `requestId`를 사용하고 동일 요청의 재시도에는 같은 ID와 본문을 사용합니다.

웹 인증 API는 같은 API 호스트에서 먼저 카카오 로그인해 HttpOnly Refresh 쿠키를 받은 뒤 호출합니다. `local` Profile은 기존 `WEB_ALLOWED_ORIGINS`에 `http://localhost:4000`을 자동 추가하므로 별도 환경변수 수정 없이 Swagger에서 문서 조회와 웹 재발급 / 로그아웃을 호출할 수 있습니다. 브라우저가 쿠키와 Origin을 전달하며, `GET /api/auth/web/csrf` 응답의 `csrfToken`을 POST의 `X-CSRF-TOKEN` 입력에 넣습니다. `webRefreshCookie`에는 값을 직접 입력하지 않습니다. 앱 인증은 JSON의 앱 Refresh Token을 사용합니다. 상세 인증 조건은 [JWT 인증 설계](docs/securityDesign.md)를 따릅니다.

API 서버는 `8080`에서 OpenAPI 문서와 업무 API를 제공하고, Swagger 화면은 `4000`에서 이 문서를 읽습니다. API 서버에는 내장 Swagger UI를 등록하지 않습니다. OpenAPI는 공통 설정에서 비활성화하고 `local` Profile에서만 기본 활성화합니다. 운영 실행에는 `local` 이외의 Profile을 명시합니다. 문서를 활성화한 경우 문서 경로의 GET만 인증 없이 허용하며 업무 API의 기존 인증은 유지합니다. Swagger UI만 중지하려면 `server/`에서 `docker compose stop swagger-ui`를 실행합니다.

## 문서

| 기준 | 문서 |
| --- | --- |
| 현재 현황·계획·검토 후보 | [프로젝트 개요](docs/projectOverview.md) |
| 우선 추진할 주민 안내 서비스 | [건물별 공지·명부 발송·채널톡 문의 기획](docs/residentCommunication.md) |
| 관리비 부과 변경 기획 | [전체·동별 부과와 월 한정 임시 부과](docs/billingSettings.md) |
| 업무 정책·저장 구조 | [도메인 규칙](docs/domainRules.md), [ERD](docs/erd.md) |
| 실행·인증 | [개발 환경](docs/developmentGuide.md), [JWT 인증](docs/securityDesign.md) |
| 초기 운영·배포 | [AWS·Nginx·GitHub Actions 배포 계획](docs/deploymentPlan.md), [Server 배포 실행·검증](server/docs/deploymentGuide.md) |
| 등록·접근 | [관리대상 등록](docs/propertyRegistrationApi.md), [관리 영역 접근](docs/managementAccessApi.md) |
| 세대·주민·역할 | [세대 관리](docs/unitManagementApi.md), [주민 관리](docs/residentManagementApi.md), [참여자·가입](docs/memberManagementApi.md) |
| 부과·수납·통장·정산 | [관리비](docs/billingApi.md), [입금](docs/paymentApi.md), [통장](docs/bankingManagement.md), [월별 정산](docs/monthlySettlementApi.md) |
| 개발 규칙 | [공통](AGENTS.md), [Client](client/AGENTS.md), [Server](server/AGENTS.md) |

화면·브라우저 처리는 `client/docs/`, 저장·트랜잭션·동시성은 `server/docs/`에서 관리하며 기능별 API 문서에서 연결합니다. Client 실행·사용법은 [Client README](client/README.md)를 참조합니다.
