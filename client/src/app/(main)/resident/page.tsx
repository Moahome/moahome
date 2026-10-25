import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResidentHomePage } from '@/screens/resident-home';
import { RESIDENT_SHARE_METADATA } from '@/app/metadata/shareMetadata';

export const metadata: Metadata = {
  ...RESIDENT_SHARE_METADATA,
  title: '주민 홈'
};

export default function Page() { return (
  <Suspense>
    <ResidentHomePage />
  </Suspense>
); }
