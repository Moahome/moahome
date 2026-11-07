import type { Metadata } from 'next';
import { AccountLedgerPage } from '@/screens/accounting/ledger';

export const metadata: Metadata = {
  title: '관리비 부과 상세'
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/accounting/ledger/billing'>) {
  const { propertyId } = await params;
  return (
    <AccountLedgerPage
      propertyId={propertyId}
      presentation={'billing'}
    />
  );
}
