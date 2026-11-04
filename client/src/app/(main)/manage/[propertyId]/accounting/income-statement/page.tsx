import type { Metadata } from 'next';
import { ComingSoonPage } from '@/screens/coming-soon';

export const metadata: Metadata = {
  title: '손익계산서'
};

export default function Page() {
  return (
    <ComingSoonPage
      menu={'회계·정산'}
      title={'손익계산서'}
      planned
    />
  );
}
