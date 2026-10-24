# moahome

모아홈은 소규모 빌라·공동주택의 주민 관리, 관리비 운영과 회계를 연결하는 관리비 통합 플랫폼입니다.
현재 프로젝트는 초기 구성 단계입니다.

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

- [프로젝트 개요](docs/projectOverview.md)
- [도메인 규칙](docs/domainRules.md)
- [ERD](docs/erd.md)
- [공용 통장 거래 분류와 동별 수입·지출 설계](docs/bankingManagement.md): 하나의 통장으로 여러 동 관리, 고지서 수납 연결과 공동지출 배분 설계. 미구현 범위와 미정 정책 포함
- [입금 관리 API](docs/paymentApi.md): 실제 대표 주민·발행 청구 연결, 수동·은행 파일 수납과 취소 계약
- [월별 정산 API](docs/monthlySettlementApi.md): 기존 거래·수납·잔고를 묶은 ADMIN 조회와 Excel·PDF·이미지(PNG)의 기준 자료, 구현
- [관리대상 등록 API](docs/propertyRegistrationApi.md)
- [세대 관리 API](docs/unitManagementApi.md): 저장된 세대 조회·추가·수정·삭제, 동 관리와 일괄 추가 계약
- [관리 영역 접근 API](docs/managementAccessApi.md): 본인 관리대상 목록과 현재 관리 권한 조회 계약, 구현
- [개발 환경 가이드](docs/developmentGuide.md)
- [JWT 인증 설계](docs/securityDesign.md)
- [공통 개발 규칙](AGENTS.md)
- [프론트엔드 개발 규칙](client/AGENTS.md)
- [백엔드 개발 규칙](server/AGENTS.md)

## 영역별 구현 설계

- [Client 관리대상 등록](client/docs/propertyRegistration.md): 화면, 단계 이동과 브라우저 초안 관리
- [Client 세대 목록](client/docs/unitList.md): 세대 관리 아래 화면 구조, 상세·수정·삭제의 역할과 구조 검증
- [Client 서비스 진입](client/docs/serviceEntry.md): 서버 목록 기반 기본 진입과 현재 관리 권한 확인 구현
- [Client 관리 레이아웃](client/docs/managementLayout.md): 공통 사이드바·드롭다운·링크와 임시 대시보드 구현, 세대 목록 연결, 그 외 업무 페이지는 후속
- [Server 관리대상 등록](server/docs/propertyRegistration.md): 검증, 저장과 중복 방지
- [Server 관리 영역 접근](server/docs/managementAccess.md): 현재 관리자 참여 조회와 접근 검증 구현

- [Server 입금 관리](server/docs/payment.md): 실제 청구 연결, 트랜잭션·동시성·중복 방지
- [Client 통장 거래 설계](client/docs/bankingManagement.md): 거래 상세의 분류 입력과 전체·동별 현황 화면 설계안
- [Client 월별 정산](client/docs/monthlySettlement.md): 드롭다운 없는 정산 / 마감 메뉴와 월 요약·점검·Excel·PDF·이미지(PNG) 미리보기·다운로드 구현. 회계·마감 잠금은 후속
- [Server 통장 거래 설계](server/docs/bankingManagement.md): 원본 입출금 확장, 기존 수납 재사용과 지출·동별 배분 저장 설계안
