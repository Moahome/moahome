import { Suspense } from 'react';
import { ResidentSettingsPage } from '@/screens/settings';

export const metadata = {
  title: '설정'
};

export default function Page() {
  return (
    <Suspense>
      <ResidentSettingsPage />
    </Suspense>
  );
}
