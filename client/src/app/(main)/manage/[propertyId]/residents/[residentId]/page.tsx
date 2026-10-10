import type { Metadata } from 'next';
import { ResidentDetailPage } from '@/screens/household/resident-detail';

export const metadata: Metadata = {
  title: '주민 상세',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/residents/[residentId]'>) {
  const { propertyId, residentId } = await params;

  return (
    <ResidentDetailPage
      key={`${propertyId}:${residentId}`}
      propertyId={propertyId}
      residentId={residentId}
    />
  );
}
