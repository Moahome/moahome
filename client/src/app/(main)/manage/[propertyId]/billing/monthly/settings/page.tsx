import type { Metadata } from 'next';
import { BillingSettingsPage } from '@/screens/billing';
export const metadata: Metadata = {
  title: '관리비 설정',
  robots: {
    index: false,
    follow: false
  }
};
export default async function Page({ params }: PageProps<'/manage/[propertyId]/billing/monthly/settings'>) {
  const { propertyId } = await params;
  return (
    <BillingSettingsPage
      propertyId={propertyId}
    />
  );
}
