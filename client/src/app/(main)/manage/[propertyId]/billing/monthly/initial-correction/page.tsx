import type { Metadata } from 'next';
import { BillingOpeningCorrectionPage } from '@/screens/billing';

export const metadata: Metadata = {
  title: '초기 기준 정정',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/billing/monthly/initial-correction'>) {
  const { propertyId } = await params;
  return (
    <BillingOpeningCorrectionPage
      propertyId={propertyId}
    />
  );
}
