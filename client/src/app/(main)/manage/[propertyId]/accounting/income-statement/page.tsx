import type { Metadata } from 'next';
import { IncomeStatementPage } from '@/screens/accounting/income-statement';

export const metadata: Metadata = {
  title: '손익계산서'
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/accounting/income-statement'>) {
  const { propertyId } = await params;

  return (
    <IncomeStatementPage
      propertyId={propertyId}
    />
  );
}
