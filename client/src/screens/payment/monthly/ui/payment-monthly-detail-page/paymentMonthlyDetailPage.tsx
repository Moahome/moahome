import { MonthlyDetailPage } from '@/widgets/payment-workspace';

export function PaymentMonthlyDetailPage({ propertyId, month, unitId }: { propertyId: string; month: string; unitId: string }) {
  return (
    <MonthlyDetailPage
      propertyId={propertyId}
      month={month}
      unitId={unitId}
    />
  );
}
