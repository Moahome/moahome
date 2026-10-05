# moahome

모아홈은 소규모 빌라·공동주택의 주민 관리, 관리비 운영과 회계를 연결하는 관리비 통합 플랫폼입니다.
현재 프로젝트는 초기 구성 단계입니다.

## 로컬 API 문서

`server/`에서 `./gradlew bootRun`으로 서버를 실행하면 기본 `local` Profile에서 다음 주소를 사용할 수 있습니다. 환경 준비는 [개발 환경 가이드](docs/developmentGuide.md)를 따릅니다.

- [Swagger UI](http://localhost:8080/swagger-ui.html)
- [OpenAPI JSON](http://localhost:8080/v3/api-docs)
- [OpenAPI YAML](http://localhost:8080/v3/api-docs.yaml)

Swagger의 `Authorize`에서 `bearerAuth`에 로그인 후 받은 Access Token만 입력하면 내 정보 조회와 관리대상 등록을 호출할 수 있습니다. 인증 입력은 새로고침 후 유지하지 않습니다. 등록 예시는 가상 정보이며, 최종 등록 호출은 실제로 개발 DB에 저장됩니다. 서로 다른 등록에는 새 `requestId`를 사용하고 동일 요청의 재시도에는 같은 ID와 본문을 사용합니다.

웹 인증 API는 같은 API 호스트에서 먼저 카카오 로그인해 HttpOnly Refresh 쿠키를 받은 뒤 호출합니다. Swagger에서 웹 재발급 / 로그아웃도 호출하려면 기존 `WEB_ALLOWED_ORIGINS`에 `http://localhost:8080`을 추가하고 서버를 재시작합니다. 브라우저가 쿠키와 Origin을 전달하며, `GET /api/auth/web/csrf` 응답의 `csrfToken`을 POST의 `X-CSRF-TOKEN` 입력에 넣습니다. `webRefreshCookie`에는 값을 직접 입력하지 않습니다. 앱 인증은 JSON의 앱 Refresh Token을 사용합니다. 상세 인증 조건은 [JWT 인증 설계](docs/securityDesign.md)를 따릅니다.

Swagger UI와 OpenAPI는 공통 설정에서 비활성화하고 `local` Profile에서만 기본 활성화합니다. 운영 실행에는 `local` 이외의 Profile을 명시합니다. 문서를 활성화한 경우 문서 경로의 GET만 인증 없이 허용하며 업무 API의 기존 인증은 유지합니다.

## 문서

- [프로젝트 개요](docs/projectOverview.md)
- [도메인 규칙](docs/domainRules.md)
- [ERD](docs/erd.md)
- [관리대상 등록 API](docs/propertyRegistrationApi.md)
- [개발 환경 가이드](docs/developmentGuide.md)
- [JWT 인증 설계](docs/securityDesign.md)
- [공통 개발 규칙](AGENTS.md)
- [프론트엔드 개발 규칙](client/AGENTS.md)
- [백엔드 개발 규칙](server/AGENTS.md)

## 영역별 구현 설계

- [Client 관리대상 등록](client/docs/propertyRegistration.md): 화면, 단계 이동과 브라우저 초안 관리
- [Server 관리대상 등록](server/docs/propertyRegistration.md): 검증, 저장과 중복 방지
