'use client';

import {
  BankingWorkspace,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
import {
  PaymentDetail,
  ManualPayment,
  usePaymentWorkspace
} from '@/widgets/payment-workspace';

export function BankingTransactionsPage({ propertyId }: { propertyId: string }) {
  const { ledger } = usePaymentWorkspace();
  const receiptRows = ledger.payments.filter((payment) => (payment.source === 'MANUAL' && !payment.bankTransactionId) || payment.status === 'CANCELED').map((payment) => ({
    id: `receipt:${payment.id}`,
    source: payment.source,
    deletable: payment.source === 'MANUAL' && !payment.bankTransactionId,
    accountId: payment.accountId,
    date: payment.date,
    time: null,
    payer: payment.payer,
    memo: null,
    amount: payment.amount,
    balance: null,
    direction: 'INCOME' as const,
    ruleKey: '',
    paymentId: payment.id,
    status: payment.status,
    unitId: payment.unitId,
    unitLabel: ledger.units.find((unit) => unit.id === payment.unitId)?.label ?? '',
    expense: null,
    receiptType: 'HOUSEHOLD' as const
  }));

  return (
    <BankingWorkspace
      propertyId={propertyId}
      receiptRows={receiptRows}
      renderManualRegistration={(onClose, onCreated) => (
        <ManualPayment
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
      renderReceiptDetail={(paymentId, onClose, onProcessed) => (
        <PaymentDetail
          key={paymentId}
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
          onProcessed={onProcessed}
        />
      )}
    />
  );
}
