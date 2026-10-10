import type { Metadata } from 'next';
import { UnitEntryPage } from '@/screens/household/unit-entry';

export const metadata: Metadata = {
  title: '세대 자동 입력',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params, searchParams }: PageProps<'/manage/[propertyId]/households/automatic'>) {
  const { propertyId } = await params;
  const query = await searchParams;

  return (
    <UnitEntryPage
      key={propertyId}
      propertyId={propertyId}
      mode={'automatic'}
      buildingId={typeof query.buildingId === 'string' ? query.buildingId : undefined}
    />
  );
}
