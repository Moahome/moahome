import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ParticipatingPropertiesPage } from '@/screens/settings';

export const metadata: Metadata = {
  title: '참여 중인 곳',
  robots: {
    index: false,
    follow: false
  }
};

export default function Page() {
  return (
    <Suspense>
      <ParticipatingPropertiesPage />
    </Suspense>
  );
}
