import type { Metadata } from 'next';
import { ResidentRegistrationPage } from '@/screens/household/resident-registration';

export const metadata: Metadata = {
  title: '주민 등록',
  robots: {
    index: false,
    follow: false
  }
};

export default async function Page({ params }: PageProps<'/manage/[propertyId]/residents/new'>) {
  const { propertyId } = await params;

  return (
    <ResidentRegistrationPage
      key={propertyId}
      propertyId={propertyId}
    />
  );
}
