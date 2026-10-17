'use client';

import { BankingIncomeAllocation } from '@/widgets/banking-workspace';
import { PaymentDetailPage } from '@/widgets/payment-workspace';

export function BankingReceiptDetailPage({ propertyId, paymentId }: { propertyId: string; paymentId: string }) {
  return (
    <PaymentDetailPage
      propertyId={propertyId}
      paymentId={paymentId}
      renderSupplement={(onBusyChange) => (
        <BankingIncomeAllocation
          propertyId={propertyId}
          paymentId={paymentId}
          onBusyChange={onBusyChange}
        />
      )}
      listPath={`/manage/${propertyId}/banking/transactions`}
      detailPath={`/manage/${propertyId}/banking/receipts`}
    />
  );
}
