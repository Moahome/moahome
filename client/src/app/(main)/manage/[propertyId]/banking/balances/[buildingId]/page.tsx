import type { Metadata } from 'next';
import { BankingBalanceDetailPage } from '@/screens/banking/balance-detail';
export const metadata: Metadata = {
  title: '동별 상세 원장'
};
export default async function Page({ params }: PageProps<'/manage/[propertyId]/banking/balances/[buildingId]'>) {
  const { propertyId, buildingId } = await params;
  return (
    <BankingBalanceDetailPage
      propertyId={propertyId}
      buildingId={buildingId}
    />
  );
}
