import type { Metadata } from 'next';
import { AccountLedgerPage } from '@/screens/accounting/ledger';

export const metadata: Metadata = {
  title: '계정별 원장'
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/accounting/ledger'>) {
  const { propertyId } = await params;
  return (
    <AccountLedgerPage
      propertyId={propertyId}
    />
  );
}
