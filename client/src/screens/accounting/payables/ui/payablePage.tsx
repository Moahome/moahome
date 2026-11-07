'use client';

import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { PayableManager } from '@/features/payable-management';
import { goBackToPreviousRoute } from '@/shared/lib/navigation-history';

/** 모바일 등록·상세도 동일한 업무 UI를 사용하고 이전 원장 조건을 보존합니다. */
export function PayablePage({ propertyId, payableId }: { propertyId: string; payableId?: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const query = search.toString();
  return (
    <PayableManager
      propertyId={propertyId}
      payableId={payableId}
      presentation={'page'}
      onCreated={(id) => router.replace(`/manage/${propertyId}/accounting/payables/${id}${query ? `?${query}` : ''}`)}
      onClose={() => { if (!goBackToPreviousRoute()) router.replace(`/manage/${propertyId}/accounting/ledger${query ? `?${query}` : ''}`); }}
    />
  );
}
