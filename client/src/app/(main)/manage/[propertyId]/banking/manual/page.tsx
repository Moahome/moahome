import type { Metadata } from 'next';
import { BankingManualPage } from '@/screens/banking/manual';

export const metadata: Metadata = {
  title: '수동 입금 등록'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <BankingManualPage
      propertyId={propertyId}
    />
  );
}
