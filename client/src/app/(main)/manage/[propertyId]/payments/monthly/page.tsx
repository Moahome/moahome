import type { Metadata } from 'next';
import { PaymentMonthlyPage } from '@/screens/payment/monthly';

export const metadata: Metadata = {
  title: '월별 수납 현황',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/payments/monthly'>) {
  const { propertyId } = await params;

  return (
    <PaymentMonthlyPage
      propertyId={propertyId}
    />
  );
}
