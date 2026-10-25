import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResidentHomePage } from '@/screens/resident-home';

export const metadata: Metadata = {
  title: '주민 홈'
};

export default function Page() { return (
  <Suspense>
    <ResidentHomePage />
  </Suspense>
); }
