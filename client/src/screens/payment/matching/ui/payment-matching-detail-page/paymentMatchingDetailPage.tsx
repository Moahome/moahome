import { PaymentDetailPage } from '@/widgets/payment-workspace';

export function PaymentMatchingDetailPage({ propertyId, paymentId }: { propertyId: string; paymentId: string }) {
  return (
    <PaymentDetailPage
      propertyId={propertyId}
      paymentId={paymentId}
    />
  );
}
