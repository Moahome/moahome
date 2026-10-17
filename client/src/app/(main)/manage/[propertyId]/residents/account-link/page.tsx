import type { Metadata } from 'next';
import { ChiefAccountLinkPage } from '@/screens/household/resident-list';

export const metadata: Metadata = {
  title: '내 관리소장 계정 연결',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <ChiefAccountLinkPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
