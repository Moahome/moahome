import { JoinRequestsPage } from '@/screens/household/join-requests';
export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <JoinRequestsPage
      propertyId={propertyId}
    />
  );
}

