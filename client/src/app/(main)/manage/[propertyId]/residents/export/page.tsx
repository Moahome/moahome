import type { Metadata } from 'next';
import { ResidentExportPage } from '@/screens/household/resident-list';

export const metadata: Metadata = {
  title: '엑셀 다운로드',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/residents/export'>) {
  const { propertyId } = await params;

  return (
    <ResidentExportPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
