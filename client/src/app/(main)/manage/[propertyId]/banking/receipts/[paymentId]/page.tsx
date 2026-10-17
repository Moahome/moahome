import type { Metadata } from 'next';
import { BankingReceiptDetailPage } from '@/screens/banking/receipt-detail';

export const metadata: Metadata = {
  title: '입금 처리 상세'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string; paymentId: string }> }) {
  const { propertyId, paymentId } = await params;
  return (
    <BankingReceiptDetailPage
      propertyId={propertyId}
      paymentId={paymentId}
    />
  );
}
