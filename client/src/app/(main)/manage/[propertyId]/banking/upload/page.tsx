import type { Metadata } from 'next';
import { BankingUploadPage } from '@/screens/banking/upload';

export const metadata: Metadata = {
  title: '통장 거래 업로드'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <BankingUploadPage
      propertyId={propertyId}
    />
  );
}
