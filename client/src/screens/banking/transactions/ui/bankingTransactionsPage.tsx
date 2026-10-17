'use client';

import {
  BankingWorkspace,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
import { PaymentDetail } from '@/widgets/payment-workspace';

export function BankingTransactionsPage({ propertyId }: { propertyId: string }) {
  return (
    <BankingWorkspace
      propertyId={propertyId}
      renderReceiptDetail={(paymentId, onClose) => (
        <PaymentDetail
          paymentId={paymentId}
          renderSupplement={(onBusyChange) => (
            <BankingIncomeAllocation
              propertyId={propertyId}
              paymentId={paymentId}
              onBusyChange={onBusyChange}
            />
          )}
          menuLabel={'통장 관리'}
          onClose={onClose}
          onProcessed={() => {}}
        />
      )}
    />
  );
}
