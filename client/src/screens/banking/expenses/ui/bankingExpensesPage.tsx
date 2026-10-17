import { BankingWorkspace } from '@/widgets/banking-workspace';

export function BankingExpensesPage({ propertyId }: { propertyId: string }) {
  return (
    <BankingWorkspace
      propertyId={propertyId}
      view={'expenses'}
    />
  );
}
