import type { ReactNode } from 'react';
import { ManagementLayoutProvider } from '@/app/providers/managementLayoutProvider';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ propertyId: string }>;
}) {
  const {
    propertyId
  } = await params;

  return (
    <ManagementLayoutProvider
      key={propertyId}
      propertyId={propertyId}
    >
      {children}
    </ManagementLayoutProvider>
  );
}
