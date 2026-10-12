'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { BillingDetail } from '../_components/billing-detail/billingDetail';
import { BillingLoadState } from '../_components/billing-load-state/billingLoadState';
import {
  useBillingMonth,
  useBillingSettings
} from '../_hooks/useBillingData';

/** 모바일 상세는 독립 주소에서 실제 월별 API를 다시 조회해 새로고침·직접 진입을 지원합니다. */
export function BillingDetailPage({ propertyId, month, unitId }: { propertyId: string; month: string; unitId?: string }) {
  const router = useRouter();
  const list = useBillingMonth(propertyId, month, unitId);
  const settings = useBillingSettings(propertyId);
  const close = () => router.replace(`/manage/${propertyId}/billing/monthly?tab=${unitId ? 'monthly' : 'history'}&month=${month}`);
  if (list.isPending || list.isError) return (
    <>
      <BillingLoadState
        pending={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
      />
      <Button
        variant={'outline'}
        onClick={close}
      >
        목록
      </Button>
    </>
  );

  return (
    <BillingDetail
      propertyId={propertyId}
      canCancel={Boolean(unitId && list.data.status === 'ISSUED' && month === settings.data?.currentMonth)}
      presentation={'page'}
      month={month}
      charges={list.data.charges}
      hasBuildings={list.data.hasBuildings}
      upcoming={list.data.status === 'SCHEDULED'}
      onClose={close}
    />
  );
}
