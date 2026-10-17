'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentDetail } from '../_components/payment-detail/paymentDetail';
import { usePaymentWorkspace } from '../payment-workspace-provider/paymentWorkspaceProvider';

/** 모바일 상세 주소 재진입을 지원하며 존재하지 않는 수납을 다른 항목으로 대체하지 않습니다. */
export function PaymentDetailPage({ propertyId, paymentId, listPath, detailPath, renderSupplement }: { propertyId: string; paymentId: string; listPath?: string; detailPath?: string; renderSupplement?: (onBusyChange: (busy: boolean) => void) => ReactNode }) {
  const router = useRouter();
  const { ledger } = usePaymentWorkspace();
  const payment = ledger.payments.find((item) => item.id === paymentId);
  const list = listPath ?? `/manage/${propertyId}/payments/matching`;
  if (!payment) return (
    <section>
      <h1>
        입금 내역을 찾을 수 없습니다.
      </h1>
      <p>
        현재 관리대상의 입금 내역을 다시 확인해주세요.
      </p>
    </section>
  );

  return (
    <PaymentDetail
      key={`${payment.id}:${payment.status}`}
      paymentId={payment.id}
      presentation={'page'}
      renderSupplement={renderSupplement}
      menuLabel={listPath ? '통장 관리' : undefined}
      onClose={() => router.replace(list)}
      onProcessed={(id) => {
        if (id !== paymentId) router.replace(`${detailPath ?? list}/${encodeURIComponent(id)}`);
      }}
    />
  );
}
