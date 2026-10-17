'use client';
import { PaymentDetail } from '@/widgets/payment-workspace';
import {
  BankingBalances,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
export function BankingBalanceDetailPage({ propertyId, buildingId }: {
    propertyId: string;
    buildingId: string;
}) {
  return (
    <BankingBalances
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
      propertyId={propertyId}
      buildingId={buildingId}
    />
  );
}
