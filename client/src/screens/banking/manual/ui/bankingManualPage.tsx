'use client';

import { useRouter } from 'next/navigation';
import { ManualPayment } from '@/widgets/payment-workspace';

/** 모바일은 공통 헤더로 복귀하고 저장 성공 뒤 같은 수납의 상세에서 확정을 이어갑니다. */
export function BankingManualPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();

  return (
    <ManualPayment
      presentation={'page'}
      onClose={() => router.replace(`/manage/${propertyId}/banking/transactions`)}
      onCreated={(id, date) => router.replace(`/manage/${propertyId}/banking/receipts/${id}?month=${date.slice(0, 7)}`)}
    />
  );
}
