import type { Metadata } from 'next';
import { BankingExpensesPage } from '@/screens/banking/expenses';

export const metadata: Metadata = {
  title: '지출 내역'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <BankingExpensesPage
      propertyId={propertyId}
    />
  );
}
