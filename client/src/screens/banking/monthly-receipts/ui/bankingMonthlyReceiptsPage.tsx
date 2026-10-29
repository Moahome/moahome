import { MonthlyReceiptsPage } from '@/widgets/payment-workspace';

export function BankingMonthlyReceiptsPage({ propertyId, month, unitId, banking = true }: {
  propertyId: string;
  month: string;
  unitId: string;
  banking?: boolean;
}) {
  return (
    <MonthlyReceiptsPage
      month={month}
      unitId={unitId}
      listPath={`/manage/${propertyId}/${banking ? 'banking' : 'payments'}/monthly`}
    />
  );
}
