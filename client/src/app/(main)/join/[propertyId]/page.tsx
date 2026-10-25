import { ResidentJoinPage } from '@/screens/resident-join';
import { RESIDENT_SHARE_METADATA } from '@/app/metadata/shareMetadata';

export const metadata = RESIDENT_SHARE_METADATA;

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <ResidentJoinPage
      propertyId={propertyId}
    />
  );
}

