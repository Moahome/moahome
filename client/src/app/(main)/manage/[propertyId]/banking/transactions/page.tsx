import type { Metadata } from 'next';
import { BankingTransactionsPage } from '@/screens/banking/transactions';

export const metadata: Metadata = {
  title: '통장 거래'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <BankingTransactionsPage
      propertyId={propertyId}
    />
  );
}
