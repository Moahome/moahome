import type { Metadata } from 'next';
import { MonthlySettlementPage } from '@/screens/accounting/settlement';

export const metadata: Metadata = {
  title: '정산 현황'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <MonthlySettlementPage
      propertyId={propertyId}
    />
  );
}
