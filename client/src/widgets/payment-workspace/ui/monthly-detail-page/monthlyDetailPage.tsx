'use client';

import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { getMonthRangeQuery } from '@/shared/lib/month-range';
import { MonthlyDetail } from '../_components/monthly-detail/monthlyDetail';

export function MonthlyDetailPage({ propertyId, month, unitId, listPath }: { propertyId: string; month: string; unitId: string; listPath?: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const period = getMonthRangeQuery(search);
  const suffix = period.size ? `?${period}` : '';

  return (
    <MonthlyDetail
      month={month}
      unitId={unitId}
      presentation={'page'}
      onClose={() => router.replace(`${listPath ?? `/manage/${propertyId}/payments/monthly`}${suffix}`)}
    />
  );
}
