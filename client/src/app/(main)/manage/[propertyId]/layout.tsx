import type { ReactNode } from 'react';
import { ManagementShell } from './managementShell';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  return (
    <ManagementShell
      key={propertyId}
      propertyId={propertyId}
    >
      {children}
    </ManagementShell>
  );
}
