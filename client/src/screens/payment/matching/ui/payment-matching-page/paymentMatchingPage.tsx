import { PaymentWorkspace } from '@/widgets/payment-workspace';

export function PaymentMatchingPage({ propertyId }: { propertyId: string }) {
  return (
    <PaymentWorkspace
      propertyId={propertyId}
      view={'matching'}
    />
  );
}
