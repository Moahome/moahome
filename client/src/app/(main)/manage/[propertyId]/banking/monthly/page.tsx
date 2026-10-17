import type { Metadata } from 'next';
import { BankingMonthlyPage } from '@/screens/banking/monthly';

export const metadata: Metadata = {
  title: '월별 수납 현황'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <BankingMonthlyPage
      propertyId={propertyId}
    />
  );
}
