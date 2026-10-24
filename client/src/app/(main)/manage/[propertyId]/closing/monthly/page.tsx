import type { Metadata } from 'next';
import { MonthlySettlementPage } from '@/screens/monthly-settlement';

export const metadata: Metadata = {
  title: '월별 정산'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <MonthlySettlementPage
      propertyId={propertyId}
    />
  );
}
