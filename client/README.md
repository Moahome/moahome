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

로그인 페이지는 `/login`에서 확인할 수 있습니다. 라우팅 진입점은 `src/app/(auth)/login/page.tsx`이며, 화면 구현은 `src/screens/login/ui/loginPage.tsx`에 있습니다. 카카오 버튼은 `src/features/kakao-login/`, 공통 로고 심볼은 `src/shared/ui/brand-mark/`에서 관리합니다. 현재 카카오 OAuth는 연결되지 않았으며 버튼을 누르면 준비 중 안내가 표시됩니다. 이용약관과 개인정보처리방침도 준비 중 안내만 제공합니다.

## 코드 배치

FSD의 의존성 경계를 유지하며 화면 전용 UI와 로직은 먼저 해당 화면에 둡니다. 공유 범위나 독립적인 책임이 분명해지면 `features`, `entities`, `widgets`로 분리합니다. 범용 UI는 `shared/ui`, 타입은 해당 화면 / 기능 / 도메인 / API 가까이에 둡니다. 작은 Props와 화면 상태는 컴포넌트 파일에 함께 둘 수 있으며 전역 `components/`, `types/`에 모으지 않습니다.

다른 슬라이스는 `index.ts` 공개 API로 사용하고, 같은 레이어의 다른 슬라이스는 직접 참조하지 않습니다. `npm run lint`에서 경계를 검사합니다. 상세 기준은 [Client 규칙](AGENTS.md)을 따릅니다.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
