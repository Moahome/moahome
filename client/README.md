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

랜딩 페이지는 `/`에서 확인할 수 있습니다. 라우팅 진입점은 `src/app/(landing)/page.tsx`이며, 화면 구현은 `src/_pages/landing/ui/landingPage.tsx`에 있습니다. 페이지 전용 컴포넌트는 같은 슬라이스의 `ui/_components/`에서 관리합니다.

로그인 페이지는 `/login`에서 확인할 수 있습니다. 라우팅 진입점은 `src/app/(auth)/login/page.tsx`이며, 화면 구현은 `src/_pages/login/ui/loginPage.tsx`에 있습니다. 카카오 버튼은 `src/features/kakao-login/`, 공통 로고 심볼은 `src/shared/ui/brand-mark/`에서 관리합니다. 현재 카카오 OAuth는 연결되지 않았으며 버튼을 누르면 준비 중 안내가 표시됩니다. 이용약관과 개인정보처리방침도 준비 중 안내만 제공합니다.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
