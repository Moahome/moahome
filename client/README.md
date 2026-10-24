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

HTTP 5xx는 기존 `/images/errors/serverError.webp`, 네트워크 실패·타임아웃(`NETWORK_ERROR`)은 `/images/states/networkError.webp`를 사용합니다. 프론트엔드 자체가 제공되지 않는 호스팅 오류 화면은 별도 범위입니다.

## 상태 안내 이미지

`shared/ui/state-message`의 `StateMessage`가 상태별 그림·제목·설명·행동을 표시합니다. 기존 완료·파일 선택·중복 수납 검토 UI에서 그림만 사용할 때는 같은 모듈의 `StateIllustration`을 사용합니다. 목록은 `layout="inline"`으로 기존 `DataTable.emptyState`에 전달하고, 조회 성공 여부와 적용된 검색·필터는 호출 화면에서 판단합니다. 로딩·조회 실패를 빈 데이터로 처리하지 않습니다.

대시보드·차량 내역·차량 승인·공지사항과 주민 홈의 미제공 기능에는 준비 중 안내를 연결했습니다. 403·API 404는 각각 자물쇠·지도 그림과 조회 실패 문구로 표시하며, 존재하지 않는 URL은 Next.js `not-found.tsx`에서 별도의 404 화면과 홈 링크를 제공합니다. 네트워크 실패와 HTTP 5xx는 그림을 구분하고 해당 조회만 재시도합니다. 기존 서버 오류 그림을 유지하며 새 500 그림은 중복으로 추가하지 않았습니다.

전체 서비스 점검은 서버 환경변수 `MOAHOME_MAINTENANCE_MODE=true`로 명시합니다. 개발 서버는 값을 바꾼 뒤 재시작하고, 프로덕션은 같은 값을 빌드와 실행 환경에 적용해 다시 빌드·배포합니다. 해제할 때도 값을 제거하거나 `false`로 바꾸고 같은 절차를 수행합니다. 루트 레이아웃이 점검 안내로 전환되며 세션 복원과 업무 화면을 마운트하지 않습니다. 일반 서버 오류만으로 점검 화면에 전환하지 않습니다. 이 설정은 프론트엔드 표시 전용이며 API 서버의 점검·쓰기 제한은 운영 환경에서 별도로 처리합니다.

일반 주민 가입 응답이 `PENDING`인 경우에만 승인 대기 그림을 사용합니다. 개인 초대 `APPROVED`와 서버가 확인한 관리대상 등록 완료는 성공 그림을 사용하며, `CHANGE_REQUESTED`·외부 관리자 `REQUESTED`를 주민 `PENDING`이나 가입 완료로 바꾸지 않습니다. 비로그인 초대 화면은 로그인 필요 그림과 기존 로그인·재확인 동작을 유지합니다. 짧은 저장 성공 토스트와 인증 실패 시의 기존 로그인 이동은 유지합니다.

파일 업로드 그림은 기존 공통 `FileDropzone`의 선택·드롭 영역에 연결하며 파일 검증과 저장은 호출자가 처리합니다. 검토 필요 그림은 실제 중복 수납 후보가 있는 상세에 표시합니다. 빈 공지 그림은 공통 자산으로 보관하며 공지·알림이 미구현인 상태에서는 준비 중 안내를 유지합니다. 제공된 흰색 배경은 보존하고 웹용 WebP로 변환했습니다.

`LoadingState`는 조회 대기를 테두리 없는 흰 배경으로 통일합니다. 짧은 대기는 작은 회전 표시와 문구를 보여주고, 700ms 이상 걸리면 최대 400px의 노트북 캐릭터를 추가하며 모바일에서는 영역 폭에 맞춥니다. 세션·관리 권한 확인, 세대·주민·가입 요청·승인·입금·통장·잔고·관리비·월별 정산 조회와 상세·등록·다운로드의 대기 상태에 연결했습니다. 공통 파일 업로드의 검증 중에는 드롭 영역의 점선과 파일 선택 안내를 숨기고 같은 로딩을 표시합니다. 로딩 원본의 투명도를 유지한 WebP를 사용하며, 이미지에 그려진 링은 정적입니다. 별도 CSS 링을 회전하고 캐릭터에 가벼운 상하 움직임을 적용하며 `prefers-reduced-motion`에서는 두 애니메이션을 중지합니다. 요청이 끝나면 로딩 컴포넌트와 지연 타이머를 해제하고 실제 조회 결과나 오류를 표시합니다.
