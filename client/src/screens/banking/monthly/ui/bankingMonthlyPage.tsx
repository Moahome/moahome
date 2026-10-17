import { PaymentWorkspace } from '@/widgets/payment-workspace';

export function BankingMonthlyPage({ propertyId }: { propertyId: string }) {
  return (
    <PaymentWorkspace
      propertyId={propertyId}
      view={'monthly'}
      banking
    />
  );
}
