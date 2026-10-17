import { BankingExpensePage } from '@/widgets/banking-workspace';

export function BankingExpenseDetailPage({ propertyId, transactionId }: { propertyId: string; transactionId: string }) {
  return (
    <BankingExpensePage
      propertyId={propertyId}
      transactionId={transactionId}
    />
  );
}
