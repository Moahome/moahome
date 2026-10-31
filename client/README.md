# 모아홈 Client

Next.js App Router·React·TypeScript 기반 Client입니다. 현재 기능과 검토 후보는 [프로젝트 개요](../docs/projectOverview.md#4-현재-개발-상태), 구조·UI·작성 규칙은 [Client AGENTS.md](AGENTS.md)를 따릅니다.

## 실행

`client/`에서 실행합니다. 필요한 도구·공개 환경변수·API 서버 준비는 [개발 환경 가이드](../docs/developmentGuide.md)를 참조합니다.

```bash
npm ci
npm run dev
```

개발 주소는 `http://localhost:3000`입니다. 프로덕션은 `npm run build` 후 `npm run start`로 실행합니다. 공개 환경변수를 변경하면 개발 서버를 재시작하거나 프로덕션을 다시 빌드합니다.

구매한 `villamoa.kr`의 운영 웹·API 주소와 Vercel·DNS 연결 상태는 [공통 배포 계획](../docs/deploymentPlan.md#2-접속-구조와-네트워크), 빌드에 넣을 공개 환경변수는 [운영 설정 표](../docs/deploymentPlan.md#4-운영-설정과-비밀값)를 따릅니다.

## PWA 설치

앱 이름·실행 주소는 `src/app/manifest.ts`, 설치 아이콘은 `public/icons/`에서 관리합니다. 기존 `moahomeIcon.svg`를 PNG로 변환했으며 Android용 maskable 아이콘과 iPhone용 180px 아이콘도 제공합니다. 설치 앱의 시작 주소는 `/start`이며 기존 세션·권한 확인을 거쳐 이동합니다.

현재 구현은 모바일 폭(767px 이하)에서 랜딩·로그인 화면 상단에 작은 설치 배너를 표시합니다. 기존 모아홈 로고(`moahomeIcon.svg`)·설치 안내 문구·다운로드 아이콘이 있는 파란 `설치하기` 버튼과 우측 상단 X를 사용하며 `나중에` 버튼은 표시하지 않습니다. 설치 버튼은 모든 모바일 폭에서 안내 글 옆 오른쪽에 두고 팝업 전체 높이의 세로 중앙에 배치합니다. 로고는 파란 배경을 덧씌우지 않고 흰 바탕에서 원본 색상으로 표시합니다. 랜딩에서는 상단 메뉴를 가리지 않게 메뉴 아래에 배치합니다. X로 닫으면 브라우저에 만료 시각을 저장해 1시간 동안 숨깁니다. 같은 브라우저의 다른 탭·새로고침에도 적용하고 열린 화면에서도 1시간 뒤 다시 표시합니다. 저장소 사용이 차단되면 현재 창의 메모리에 한 시간 숨김을 유지합니다. 숨김 중에도 관리자·주민 공통 설정의 `모아홈 앱 → 앱 설치`로 다시 진입할 수 있습니다. PC에는 설치 안내 UI를 표시하지 않으며 브라우저 자체 설치 메뉴는 사용할 수 있습니다. 설치 앱으로 실행 중이거나 현재 창에서 설치 완료를 확인하면 배너를 숨깁니다. 일반 브라우저에서 과거 설치 여부를 항상 확인할 수 있는 것은 아닙니다.

`beforeinstallprompt`를 지원하면 사용자 클릭으로 설치 창을 열고, iPhone에는 공유 메뉴의 `홈 화면에 추가`를 안내합니다. 설치 이벤트가 없거나 오류가 발생하면 브라우저 메뉴 사용 방법을 안내합니다. 이 단계는 설치 기능만 제공하며 Service Worker, 오프라인 저장과 푸시 알림은 추가하지 않았습니다.

재배포 후 HTTPS 운영 주소에서 `/manifest.webmanifest`와 아이콘의 공개 응답을 확인하고 Android Chrome·iPhone Safari에서 설치·실행·카카오 로그인과 세션 유지를 실제 기기로 검증합니다. 로컬에서는 `localhost`로 확인할 수 있으며 일반 HTTP LAN 주소는 설치 조건을 충족하지 않습니다.

## URL 공유 미리보기

홈페이지와 기본 공유에는 노트북 이미지, `/join`, `/join/[propertyId]`, `/resident`와 `/invitations?type=resident`에는 스마트폰 이미지를 사용합니다. `/invitations`는 부담당자 초대용 노트북 이미지와 안내 문구를 제공합니다. 주민 개인 초대의 링크 복사·메시지 공유는 `?type=resident`를 포함하며 초대코드는 기존처럼 `#` 뒤에 유지합니다. 기존 개인 초대 링크도 가입할 수 있지만 용도 표시가 없으면 기본 초대 미리보기가 표시됩니다.

이미지는 `public/images/share/`에 제공받은 PNG 원본으로 보관합니다. 미리보기는 로그인·초대 조회 없이 읽을 수 있는 Open Graph와 Twitter 메타데이터로 제공하며 이름·세대·초대코드를 포함하지 않습니다. 빌드 환경의 `NEXT_PUBLIC_HOST`를 실제 공개 웹 Origin으로 설정해야 이미지 절대 주소가 해당 호스트를 가리킵니다. 미설정 시 로컬 개발 주소를 사용합니다. 카카오톡에 이전 미리보기가 남으면 배포 후 [카카오 OG 캐시 초기화 도구](https://developers.kakao.com/tool/clear/og)를 사용합니다. 문자 앱의 미리보기 표시 여부는 수신 환경에 따라 다릅니다.

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
npm run typecheck
npm run build
npm test
```

`npm run typecheck`는 `next typegen`으로 `PageProps`·`LayoutProps` 등 라우트 타입을 생성한 뒤 TypeScript 검사를 실행합니다. 새 체크아웃과 CI에서도 이전 개발·빌드 결과 없이 검사할 수 있으며, 생성 파일은 Git에 포함하지 않습니다.

`npm run test:api`는 브라우저 없는 구조·API·세션·업무 모델 검사, `npm run test:e2e`는 브라우저 통합 검사입니다. 최초 브라우저 준비는 `npx playwright install chromium`, 설치된 Chrome 사용은 `PLAYWRIGHT_CHANNEL=chrome npm test`입니다. 테스트 서버는 포트 3100과 `.next-test/`를 사용합니다.

브라우저 검사는 테스트 전용 환경변수로 `.next-test/`에 프로덕션 빌드를 생성한 뒤 `next start`로 실행합니다. 개발 서버의 경로별 재컴파일·Fast Refresh·manifest 읽기 경합을 화면 오류와 혼동하지 않도록 배포 번들을 검증하며, 기본 `workers: 1`을 사용합니다. API 프로젝트만 실행하면 빌드·서버를 시작하지 않습니다.

GitHub Actions에서는 `npm test -- --workers=2`로 전체 검사를 두 작업자에서 실행합니다. Playwright의 테스트 서버 시작에 프로덕션 빌드가 포함되므로 CI에서 같은 빌드를 별도로 반복하지 않습니다. 검증 후 Vercel 배포 단계에서는 실제 운영 환경변수로 다시 빌드합니다.

브라우저 테스트는 API·주소 검색 응답을 모의 처리합니다. 실제 카카오·API 서버·DB·Redis 연동 검증과 구분하며 필수 검증·대체 빌드의 보고 기준은 [Client 규칙](AGENTS.md#9-test--build)을 따릅니다.

실행 결과는 `playwright-report/`의 HTML 보고서로 남깁니다. 테스트 목록·단계·실패 화면·Trace를 보려면 아래 명령을 실행한 뒤 표시되는 로컬 주소를 엽니다. 실패한 테스트의 화면과 Trace는 자동 보관하며, 주요 화면 시나리오의 캡처는 보고서 첨부에서 확인합니다. 보고서와 `test-results/`는 Git에 포함하지 않습니다. GitHub Actions도 테스트 결과가 생성되면 성공·실패와 관계없이 `client-test-results` artifact로 7일간 보관합니다.

```bash
npm run test:report
```

다른 보고서 서버가 이미 실행 중이면 `npm run test:report -- --port 9324`처럼 포트를 지정합니다. 이전 결과를 비교하려면 테스트 실행 시 `PLAYWRIGHT_HTML_REPORT`와 `--output`을 별도 경로로 지정해 다음 실행에 덮어쓰이지 않게 합니다. 개발 모드의 취소된 요청은 완료된 API 응답과 구분하고, PC 모달·모바일 경로와 스크롤 복원·소수점 좌표를 고려해 실제 화면 동작을 검증합니다.

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

## 참고용 금액 계산기

`shared/ui/amount-calculator`의 `AmountCalculator`는 일반 계산·분담 계산 탭을 제공하며 `open`과 `onClose`로 여닫습니다. `title`, `description`, `countLabel`, `countUnit`, `resultLabel`로 화면에 맞는 문구를 지정합니다. 고정 이미지 버튼까지 필요하면 같은 모듈의 `FloatingCalculator`를 사용합니다. 계산·복사만 제공하며 호출 화면의 입력이나 저장 API를 변경하지 않습니다.

계산만 필요하면 `shared/lib/calculator`의 `evaluateExpression(계산식)` 또는 `shared/lib/equal-split`의 `calculateEqualSplit(총금액문자열, 수량문자열)`을 사용합니다. 일반 계산은 정확한 분수 연산 후 소수점 12자리까지 반올림하고 근삿값 여부를 반환합니다. 분담 계산은 잘못된 입력에 null, 정상 입력에 BigInt 분담 금액·전체 합계·부족액·초과액을 반환합니다. 자세한 동작은 [공용 계산기](docs/managementLayout.md#공용-계산기-2026-10-25)를 참조합니다.
