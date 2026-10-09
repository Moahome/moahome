import type { Metadata } from 'next';
import { ManagementDashboardPage } from '@/screens/management-dashboard';

export const metadata: Metadata = {
  title: '관리 대시보드',
  robots: {
    index: false,
    follow: false
  },
};

export default function Page() {
  return <ManagementDashboardPage />;
}
