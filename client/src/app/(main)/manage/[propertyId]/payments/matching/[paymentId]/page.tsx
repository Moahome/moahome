import type { Metadata } from 'next';
import { PaymentMatchingDetailPage } from '@/screens/payment/matching';

export const metadata: Metadata = {
  title: '입금 처리 상세',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/payments/matching/[paymentId]'>) {
  const { propertyId, paymentId } = await params;

  return (
    <PaymentMatchingDetailPage
      propertyId={propertyId}
      paymentId={paymentId}
    />
  );
}
