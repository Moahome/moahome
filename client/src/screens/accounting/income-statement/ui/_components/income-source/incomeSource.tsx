'use client';

import {
  BankingExpensePage,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
import {
  MonthlyDetail,
  PaymentDetail,
  PaymentWorkspaceProvider
} from '@/widgets/payment-workspace';

/** 원천별 기존 상세를 재사용해 PC에서 목록과 조회 조건을 벗어나지 않습니다. */
export function IncomeSource({ propertyId, path, onClose }: { propertyId: string; path: string; onClose: () => void }) {
  const expense = path.match(/^\/banking\/transactions\/([0-9a-f-]{36})(?:\?|$)/i);
  if (expense) return (
    <BankingExpensePage
      propertyId={propertyId}
      transactionId={expense[1]}
      presentation={'modal'}
      onClose={onClose}
    />
  );
  const monthly = path.match(/^\/banking\/monthly\/(\d{4}-\d{2})\/([0-9a-f-]{36})(?:\?|$)/i);
  if (monthly) return (
    <PaymentWorkspaceProvider
      propertyId={propertyId}
    >
      <MonthlyDetail
        month={monthly[1]}
        unitId={monthly[2]}
        onClose={onClose}
      />
    </PaymentWorkspaceProvider>
  );
  const receipt = path.match(/^\/banking\/receipts\/([0-9a-f-]{36})(?:\?|$)/i);
  if (!receipt) return null;

  return (
    <PaymentWorkspaceProvider
      propertyId={propertyId}
    >
      <PaymentDetail
        paymentId={receipt[1]}
        menuLabel={'통장 관리'}
        onClose={onClose}
        onProcessed={() => {}}
        renderSupplement={(onBusyChange) => (
          <BankingIncomeAllocation
            propertyId={propertyId}
            paymentId={receipt[1]}
            onBusyChange={onBusyChange}
          />
        )}
      />
    </PaymentWorkspaceProvider>
  );
}
