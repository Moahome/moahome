'use client';

import { useRouter } from 'next/navigation';
import { MonthlyDetail } from '../_components/monthly-detail/monthlyDetail';

export function MonthlyDetailPage({ propertyId, month, unitId }: { propertyId: string; month: string; unitId: string }) {
  const router = useRouter();

  return (
    <MonthlyDetail
      month={month}
      unitId={unitId}
      presentation={'page'}
      onClose={() => router.replace(`/manage/${propertyId}/payments/monthly`)}
    />
  );
}
