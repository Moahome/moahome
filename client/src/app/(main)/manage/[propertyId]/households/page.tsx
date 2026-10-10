import type { Metadata } from 'next';
import { UnitListPage } from '@/screens/household/unit-list';

export const metadata: Metadata = {
  title: '세대 목록',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/households'>) {
  const { propertyId } = await params;

  return (
    <UnitListPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
