import type { Metadata } from 'next';
import { UnitEntryPage } from '@/screens/household/unit-entry';

export const metadata: Metadata = {
  title: '동 관리',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/households/buildings'>) {
  const { propertyId } = await params;

  return (
    <UnitEntryPage
      key={propertyId}
      propertyId={propertyId}
      mode={'buildings'}
    />
  );
}
