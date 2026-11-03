import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SystemMemberListPage } from '@/screens/system-admin/member-list';
export const metadata: Metadata = {
  title: '시스템 관리',
  robots: {
    index: false,
    follow: false
  }
};
export default function Page() { return (
  <Suspense>
    <SystemMemberListPage />
  </Suspense>
); }
