import type { Metadata } from 'next';
import { UnitEntryPage } from '@/screens/household/unit-entry';

export const metadata: Metadata = {
  title: '세대 추가',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params, searchParams }: PageProps<'/manage/[propertyId]/households/new'>) {
  const { propertyId } = await params;
  const query = await searchParams;

  return (
    <UnitEntryPage
      key={propertyId}
      propertyId={propertyId}
      mode={'create'}
      buildingId={typeof query.buildingId === 'string' ? query.buildingId : undefined}
    />
  );
}
