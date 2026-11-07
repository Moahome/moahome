import type { Metadata } from 'next';
import { AccountingAccountsPage } from '@/screens/accounting/accounts';

export const metadata: Metadata = {
  title: '계정과목 설정'
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/accounting/accounts'>) {
  const { propertyId } = await params;
  return (
    <AccountingAccountsPage
      propertyId={propertyId}
    />
  );
}
