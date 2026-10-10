import type { Metadata } from 'next';
import { ResidentImportPage } from '@/screens/household/resident-import';

export const metadata: Metadata = {
  title: '주민 엑셀 업로드',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/residents/import'>) {
  const { propertyId } = await params;

  return (
    <ResidentImportPage
      propertyId={propertyId}
      key={propertyId}
    />
  );
}
