import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaymentMonthlyDetailPage } from '@/screens/payment/monthly';

export const metadata: Metadata = {
  title: '세대 수납 상세',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/payments/monthly/[month]/[unitId]'>) {
  const { propertyId, month, unitId } = await params;
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month)) notFound();

  return (
    <PaymentMonthlyDetailPage
      propertyId={propertyId}
      month={month}
      unitId={unitId}
    />
  );
}
