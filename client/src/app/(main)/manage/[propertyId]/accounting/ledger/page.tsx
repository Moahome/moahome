import type { Metadata } from 'next';
import { ComingSoonPage } from '@/screens/coming-soon';

export const metadata: Metadata = {
  title: '계정별 원장'
};

export default function Page() {
  return (
    <ComingSoonPage
      menu={'회계·정산'}
      title={'계정별 원장'}
      planned
    />
  );
}
