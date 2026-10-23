import type { Metadata } from 'next';
import { BankingManualExpensePage } from '@/screens/banking/manual-expense';

export const metadata: Metadata = {
  title: '수동 지출 등록'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <BankingManualExpensePage
      propertyId={propertyId}
    />
  );
}
