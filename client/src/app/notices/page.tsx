import { Suspense } from 'react';
import { ResidentNoticePage } from '@/screens/resident-notices';

export default function Page() {
  return (
    <Suspense>
      <ResidentNoticePage />
    </Suspense>
  );
}
