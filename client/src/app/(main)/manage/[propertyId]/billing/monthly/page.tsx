import type { Metadata } from 'next';
import { BillingPage } from '@/screens/billing';
export const metadata: Metadata = {
  title: '관리비 부과',
  robots: {
    index: false,
    follow: false
  }
};
export default async function Page({ params }: PageProps<'/manage/[propertyId]/billing/monthly'>) {
  const { propertyId } = await params;
  return (
    <BillingPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
