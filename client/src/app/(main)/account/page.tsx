import type { Metadata } from 'next';
import { AccountPage } from '@/screens/account';

export const metadata: Metadata = {
  title: '내 정보',
  robots: {
    index: false,
    follow: false
  }
};

export default function Page() {
  return <AccountPage />;
}
