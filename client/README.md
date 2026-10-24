# 모아홈 Client

Next.js App Router·React·TypeScript 기반 Client입니다. 현재 기능과 검토 후보는 [프로젝트 개요](../docs/projectOverview.md#4-현재-개발-상태), 구조·UI·작성 규칙은 [Client AGENTS.md](AGENTS.md)를 따릅니다.

## 실행

`client/`에서 실행합니다. 필요한 도구·공개 환경변수·API 서버 준비는 [개발 환경 가이드](../docs/developmentGuide.md)를 참조합니다.

```bash
npm ci
npm run dev
```

개발 주소는 `http://localhost:3000`입니다. 프로덕션은 `npm run build` 후 `npm run start`로 실행합니다. 공개 환경변수를 변경하면 개발 서버를 재시작하거나 프로덕션을 다시 빌드합니다.

## 화면과 상세 설계

| 영역 | 문서 |
| --- | --- |
| 로그인 후 진입·추가 등록 | [서비스 진입](docs/serviceEntry.md), [초기 등록·초안](docs/propertyRegistration.md) |
| 관리 공통 UI·메뉴 | [관리 레이아웃](docs/managementLayout.md) |
| 세대·주민·가입·역할 | [세대 목록](docs/unitList.md), [주민 목록](docs/residentList.md), [역할·가입](docs/memberManagement.md) |
| 부과·수납 | [부과 화면](docs/managementLayout.md#관리비-부과-2026-10-10), [수납 화면](docs/paymentManagement.md) |
| 통장·지출·동별 잔고 | [통장 화면](docs/bankingManagement.md) |
| 월별 정산·파일 | [월별 정산](docs/monthlySettlement.md), [엑셀 공통 서식](docs/excelReports.md) |

라우팅은 `src/app/`, 실제 화면은 `src/screens/`에 둡니다. 공통 컴포넌트 사용과 공개 API·타입·폴더 규칙은 AGENTS.md에서 관리하며 README에 중복 정의하지 않습니다.

## 공통 API와 세션 사용

쿠키 인증 요청은 `shared/api`의 `customAPI`, 브라우저 업무 요청은 `entities/session`의 `authenticatedAPI`를 사용합니다. 둘 다 공개 진입점으로 가져옵니다.

```ts
import { authenticatedAPI } from '@/entities/session';

const result = await authenticatedAPI<{ count: number }>({
  url: '/api/example',
  data: { page: 1 },
});
```

위 경로는 사용법 예시입니다. GET 데이터는 쿼리, 다른 메서드의 데이터는 JSON 본문이며 파일은 공통 multipart 옵션을 사용합니다. 인증된 업무 요청은 메모리 Access Token을 사용하고 만료 응답에서 원 요청을 한 번 재시도합니다. 개별 화면에서 토큰·쿠키 Rotation을 중복 구현하지 않습니다.

루트 `AppProviders`가 앱 시작·새로고침 시 세션을 복원하고 본인 정보를 조회합니다. 화면은 `useSession()`으로 같은 조회를 공유합니다. 쿠키·토큰 보관·여러 탭 조율·장애 처리의 기준은 [인증 설계](../docs/securityDesign.md)를 따릅니다.

## 검증

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
npm test
```

`npm run test:api`는 브라우저 없는 구조·API·세션·업무 모델 검사, `npm run test:e2e`는 브라우저 통합 검사입니다. 최초 브라우저 준비는 `npx playwright install chromium`, 설치된 Chrome 사용은 `PLAYWRIGHT_CHANNEL=chrome npm test`입니다. 테스트 서버는 포트 3100과 `.next-test/`를 사용합니다.

브라우저 테스트는 API·주소 검색 응답을 모의 처리합니다. 실제 카카오·API 서버·DB·Redis 연동 검증과 구분하며 필수 검증·대체 빌드의 보고 기준은 [Client 규칙](AGENTS.md#9-test--build)을 따릅니다.

## 서버 연결 오류 안내

개발 모드 API 진단 로그는 메서드·쿼리를 제외한 경로·상태·안전한 오류 코드와 위치만 기록합니다. 인증정보·본문·파일·원본 예외는 출력하지 않으며 프로덕션에서는 비활성화합니다.

조회 연결 실패·타임아웃·HTTP 5xx는 `shared/ui/server-connection-error`의 `ServerConnectionError`로 표시합니다. 재시도는 해당 조회만 다시 실행하며 저장을 자동 반복하지 않습니다. 인증·권한·입력 오류와 토큰 교체 결과 미확인의 재로그인 처리는 [인증 설계](../docs/securityDesign.md)를 따릅니다. 실제 폼을 유지하는 화면만 `inputPreserved`를 지정합니다.

오류 이미지는 정적 `/images/errors/serverError.webp`를 사용합니다. 프론트엔드 자체가 제공되지 않는 호스팅 오류 화면은 별도 범위입니다.
