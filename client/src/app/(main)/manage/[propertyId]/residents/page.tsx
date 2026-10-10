import type { Metadata } from 'next';
import { ResidentListPage } from '@/screens/household/resident-list';

export const metadata: Metadata = {
  title: '주민 목록',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/residents'>) {
  const { propertyId } = await params;

  return (
    <ResidentListPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
