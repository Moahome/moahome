import type { Metadata } from 'next';
import { JoinRequestsPage } from '@/screens/household/join-requests';
export const metadata: Metadata = {
  title: '가입 요청',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <JoinRequestsPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}

