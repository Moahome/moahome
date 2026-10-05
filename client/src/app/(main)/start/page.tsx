import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StartPage } from '@/screens/start';

export const metadata: Metadata = {
  title: '시작하기',
  robots: {
    index: false,
    follow: false
  },
};

export default function Page() {
  return (
    <Suspense>
      <StartPage />
    </Suspense>
  );
}
