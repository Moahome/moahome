import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SystemAdministratorListPage } from '@/screens/system-admin/administrator-list';
export const metadata: Metadata = {
  title: '시스템 관리',
  robots: {
    index: false,
    follow: false
  }
};
export default function Page() { return (
  <Suspense>
    <SystemAdministratorListPage />
  </Suspense>
); }
