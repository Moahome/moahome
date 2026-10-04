This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

랜딩 페이지는 `/`에서 확인할 수 있습니다. 라우팅 진입점은 `src/app/(landing)/page.tsx`이며, 화면 구현은 `src/screens/landing/ui/landingPage.tsx`에 있습니다. 내부 컴포넌트는 같은 `ui/` 안의 `_components/`, 화면 구성 상수는 `_constants/`에서 관리합니다. 헤더, 로고, 제품 미리보기와 등장 효과의 스타일은 각 컴포넌트 옆의 CSS Modules에서 관리하며, 화면 CSS는 화면 배치와 섹션 스타일을 담당합니다.

로그인 페이지는 `/login`에서 확인할 수 있습니다. 라우팅 진입점은 `src/app/(auth)/login/page.tsx`이며, 화면 구현은 `src/screens/login/ui/loginPage.tsx`에 있습니다. 카카오 버튼은 `src/features/kakao-login/`, 공통 로고 심볼은 `src/shared/ui/brand-mark/`에서 관리합니다. 버튼은 `NEXT_PUBLIC_API_HOST`의 `/oauth2/authorization/kakao`로 브라우저를 이동시킵니다. 서버의 로그인 취소 / 실패 코드는 `/login?error=...`에서 안내합니다. 이용약관과 개인정보처리방침은 준비 중 안내를 제공합니다.

`/login/callback`은 CSRF 조회 후 토큰을 재발급하고 로그인 완료 상태를 표시합니다. 화면 구현은 `src/screens/login-callback/ui/loginCallbackPage.tsx`이며, 화면 상태 타입과 오류 안내 함수도 같은 파일에서 관리합니다. 최종 관리대상별 진입 화면은 후속 연결 범위입니다. 설정은 [개발 가이드](../docs/developmentGuide.md)의 카카오 로그인 절을 따릅니다.

## 코드 배치

FSD의 의존성 경계를 유지하며 화면 전용 UI와 로직은 먼저 해당 화면에 둡니다. 공유 범위나 독립적인 책임이 분명해지면 `features`, `entities`, `widgets`로 분리합니다. 범용 UI는 `shared/ui`, 타입은 해당 화면 / 기능 / 도메인 / API 가까이에 둡니다. 작은 Props와 화면 상태는 컴포넌트 파일에 함께 둘 수 있으며 전역 `components/`, `types/`에 모으지 않습니다.

다른 슬라이스는 `index.ts` 공개 API로 사용하고, 같은 레이어의 다른 슬라이스는 직접 참조하지 않습니다. `npm run lint`에서 경계를 검사합니다. 상세 기준은 [Client 규칙](AGENTS.md)을 따릅니다.

## 공통 API 호출

`src/shared/api/`의 `customAPI`는 서버 경로, HTTP 메서드와 데이터를 받습니다. 메서드를 생략하면 GET입니다. GET 데이터는 쿼리로, POST / PUT / PATCH / DELETE 데이터는 JSON 본문으로 전달합니다. GET 배열은 같은 쿼리 키를 반복하고 null / undefined 값은 생략합니다. 중첩 쿼리 객체는 허용하지 않습니다.

```ts
import { customAPI } from "@/shared/api";

const result = await customAPI<{ count: number }>({
  url: "/api/example",
  method: "GET",
  data: { page: 1 },
});

await customAPI({
  url: "/api/example",
  method: "POST",
  data: { name: "모아홈" },
});
```

위 `/api/example`은 호출 형식 설명용이며 실제 서버 API가 아닙니다. `credentials: "include"`, `cache: "no-store"`, JSON 응답 파싱과 15초 요청 제한은 공통 처리합니다. HTTP 오류는 `ApiError`의 `status`와 `code`로 구분합니다. 본문 없는 API는 `customAPI<void>()`로 호출합니다. 경로는 `/`로 시작하는 API 호스트 내부 경로만 허용합니다.

CSRF나 Bearer 인증이 필요한 호출은 선택적인 `headers`로 `X-CSRF-TOKEN` / `Authorization`을 전달합니다. 공통 전송 코드는 상위 FSD 레이어의 인증 상태를 직접 참조하지 않습니다. 자동 Bearer 주입과 업무 API의 Access 만료 재시도는 후속 연결 범위입니다.

## 세션 복원

`src/features/restore-session/`의 `restoreSession()`을 콜백 화면이나 후속 앱 초기화에서 재사용합니다. `GET /api/auth/web/csrf` → `POST /api/auth/web/refresh` 순서로 호출하고 `src/entities/session/`의 브라우저 메모리에 Access Token과 만료시각, CSRF 토큰을 보관합니다. Refresh Token은 HttpOnly 쿠키로만 전달합니다.

같은 탭의 중복 복원은 Promise를 공유하고 유효한 메모리 토큰은 재사용합니다. 여러 탭은 [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)로 CSRF 조회와 쿠키 교체 전체를 직렬화합니다. Web Locks가 없는 환경은 동시 재발급을 허용하지 않고 브라우저 업데이트를 안내합니다. 운영 HTTPS / 로컬 localhost 기준은 [인증 설계](../docs/securityDesign.md)를 따릅니다.

인증 거부는 재로그인을 안내하며, 503은 기존 메모리 세션을 지우지 않고 사용자가 재시도할 수 있게 합니다. 재발급 응답이 유실되거나 잘못된 토큰 응답을 받으면 추가 재발급을 차단하고 다시 로그인하도록 안내합니다. 모든 페이지의 전역 세션 자동 복원은 후속 연결 범위입니다.

## 검증

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
npx playwright install chromium
npm test
```

`npm run test:api`는 공통 API / 세션 복원 테스트, `npm run test:e2e`는 로그인 화면 통합 테스트를 실행합니다. 설치된 Chrome을 이용할 때는 `PLAYWRIGHT_CHANNEL=chrome npm test`를 사용합니다. 통합 테스트는 포트 3100과 별도 `.next-test/` 결과를 사용하며 서버 인증 응답을 모의 처리합니다. 실제 카카오 로그인 성공이나 서버 DB / Redis 연결은 별도로 확인합니다.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
