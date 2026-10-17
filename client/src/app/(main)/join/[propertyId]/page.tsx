import { ResidentJoinPage } from '@/screens/resident-join';
export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <ResidentJoinPage
      propertyId={propertyId}
    />
  );
}

