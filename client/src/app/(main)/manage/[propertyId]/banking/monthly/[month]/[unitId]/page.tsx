import type { Metadata } from 'next';
import { BankingMonthlyDetailPage } from '@/screens/banking/monthly-detail';

export const metadata: Metadata = {
  title: '세대 수납 상세'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string; month: string; unitId: string }> }) {
  const { propertyId, month, unitId } = await params;
  return (
    <BankingMonthlyDetailPage
      propertyId={propertyId}
      month={month}
      unitId={unitId}
    />
  );
}
