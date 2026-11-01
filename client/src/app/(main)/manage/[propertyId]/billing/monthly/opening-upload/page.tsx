import type { Metadata } from 'next';
import { BillingOpeningUploadPage } from '@/screens/billing';

export const metadata: Metadata = {
  title: '기존 잔액 엑셀 업로드',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/billing/monthly/opening-upload'>) {
  const { propertyId } = await params;
  return (
    <BillingOpeningUploadPage
      propertyId={propertyId}
    />
  );
}
