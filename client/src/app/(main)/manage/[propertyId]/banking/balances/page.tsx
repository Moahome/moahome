import type { Metadata } from 'next';
import { BankingBalancesPage } from '@/screens/banking/balances';
export const metadata: Metadata = {
  title: '동별 잔고·정산'
};
export default async function Page({ params }: PageProps<'/manage/[propertyId]/banking/balances'>) {
  const { propertyId } = await params;
  return (
    <BankingBalancesPage
      propertyId={propertyId}
    />
  );
}
