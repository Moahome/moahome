import type { Metadata } from 'next';
import { AccountRecoveryPage } from '@/screens/account-recovery';

export const metadata: Metadata = {
  title: '계정 복구',
  robots: {
    index: false,
    follow: false
  }
};

export default function Page() {
  return <AccountRecoveryPage />;
}
