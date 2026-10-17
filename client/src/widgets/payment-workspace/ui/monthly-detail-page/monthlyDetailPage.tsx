'use client';

import { useRouter } from 'next/navigation';
import { MonthlyDetail } from '../_components/monthly-detail/monthlyDetail';

export function MonthlyDetailPage({ propertyId, month, unitId, listPath }: { propertyId: string; month: string; unitId: string; listPath?: string }) {
  const router = useRouter();

  return (
    <MonthlyDetail
      month={month}
      unitId={unitId}
      presentation={'page'}
      onClose={() => router.replace(listPath ?? `/manage/${propertyId}/payments/monthly`)}
    />
  );
}
