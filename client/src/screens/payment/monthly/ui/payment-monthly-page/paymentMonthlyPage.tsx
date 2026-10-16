import { PaymentWorkspace } from '@/widgets/payment-workspace';

export function PaymentMonthlyPage({ propertyId }: { propertyId: string }) {
  return (
    <PaymentWorkspace
      propertyId={propertyId}
      view={'monthly'}
    />
  );
}
