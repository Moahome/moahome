import type { Metadata } from 'next';
import { UnitEntryPage } from '@/screens/household/unit-entry';

export const metadata: Metadata = {
  title: '세대 수정',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/households/[unitId]/edit'>) {
  const { propertyId, unitId } = await params;

  return (
    <UnitEntryPage
      key={unitId}
      propertyId={propertyId}
      mode={'edit'}
      unitId={unitId}
    />
  );
}
