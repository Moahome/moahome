import type { Metadata } from 'next';
import { BankingExpenseDetailPage } from '@/screens/banking/expense-detail';

export const metadata: Metadata = {
  title: '지출 상세'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string; transactionId: string }> }) {
  const { propertyId, transactionId } = await params;
  return (
    <BankingExpenseDetailPage
      propertyId={propertyId}
      transactionId={transactionId}
    />
  );
}
