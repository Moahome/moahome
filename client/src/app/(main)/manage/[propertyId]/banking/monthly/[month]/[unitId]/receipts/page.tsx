import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BankingMonthlyReceiptsPage } from '@/screens/banking/monthly-receipts';

export const metadata: Metadata = {
  title: '전체 입금 내역'
};

export default async function Page({ params }: {
  params: Promise<{ propertyId: string; month: string; unitId: string }>;
}) {
  const { propertyId, month, unitId } = await params;
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  return (
    <BankingMonthlyReceiptsPage
      propertyId={propertyId}
      month={month}
      unitId={unitId}
    />
  );
}
