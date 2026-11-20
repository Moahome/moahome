import { Suspense } from 'react';
import { ResidentNoticePage } from '@/screens/resident-notices';

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <Suspense>
      <ResidentNoticePage
        propertyId={propertyId}
      />
    </Suspense>
  );
}
