import type { ReactNode } from 'react';
import { PaymentWorkspaceProvider } from '@/widgets/payment-workspace';

export default async function Layout({ children, params }: {
  children: ReactNode; params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  return (
    <PaymentWorkspaceProvider
      key={propertyId}
      propertyId={propertyId}
    >
      {children}
    </PaymentWorkspaceProvider>
  );
}
