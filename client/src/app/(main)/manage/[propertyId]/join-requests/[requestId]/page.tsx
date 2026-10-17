import { JoinRequestsPage } from '@/screens/household/join-requests';
export default async function Page({ params }: { params: Promise<{ propertyId: string; requestId: string }> }) {
  const { propertyId, requestId } = await params;

  return (
    <JoinRequestsPage
      propertyId={propertyId}
      requestId={requestId}
    />
  );
}

