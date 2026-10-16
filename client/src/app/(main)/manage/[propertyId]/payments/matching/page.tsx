import type { Metadata } from 'next';
import { PaymentMatchingPage } from '@/screens/payment/matching';

export const metadata: Metadata = {
  title: '입금 확인·매칭',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/payments/matching'>) {
  const { propertyId } = await params;

  return (
    <PaymentMatchingPage
      propertyId={propertyId}
    />
  );
}
