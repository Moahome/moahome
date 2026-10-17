import { MonthlyDetailPage } from '@/widgets/payment-workspace';

export function BankingMonthlyDetailPage({ propertyId, month, unitId }: { propertyId: string; month: string; unitId: string }) {
  return (
    <MonthlyDetailPage
      propertyId={propertyId}
      month={month}
      unitId={unitId}
      listPath={`/manage/${propertyId}/banking/monthly`}
    />
  );
}
