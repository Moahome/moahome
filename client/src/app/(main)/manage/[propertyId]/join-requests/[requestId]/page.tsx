import type { Metadata } from 'next';
import { ApprovalManagementPage } from '@/screens/household/approval-management';
export const metadata: Metadata = {
  title: '가입 요청 확인',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: { params: Promise<{ propertyId: string; requestId: string }> }) {
  const { propertyId, requestId } = await params;

  return (
    <ApprovalManagementPage
      propertyId={propertyId}
      requestId={requestId}
    />
  );
}

