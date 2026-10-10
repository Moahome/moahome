import type { Metadata } from 'next';
import { BillingDetailPage } from '@/screens/billing';
export const metadata: Metadata = {
  title: '관리비 상세',
  robots: {
    index: false,
    follow: false
  }
};
export default async function Page({ params }: PageProps<'/manage/[propertyId]/billing/monthly/history/[month]'>) {
  const { propertyId, month } = await params;
  return (
    <BillingDetailPage
      propertyId={propertyId}
      month={month}
    />
  );
}
