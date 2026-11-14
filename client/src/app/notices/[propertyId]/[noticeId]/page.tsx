import { Suspense } from 'react';
import { ResidentNoticePage } from '@/screens/resident-notices';

export default async function Page({ params }: { params: Promise<{ propertyId: string; noticeId: string }> }) {
  const { propertyId, noticeId } = await params;
  return (
    <Suspense>
      <ResidentNoticePage
        propertyId={propertyId}
        noticeId={noticeId}
      />
    </Suspense>
  );
}
