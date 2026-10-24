import type { Metadata } from 'next';
import { ApprovalManagementPage } from '@/screens/household/approval-management';

export const metadata: Metadata = {
  title: '승인 관리',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <ApprovalManagementPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
