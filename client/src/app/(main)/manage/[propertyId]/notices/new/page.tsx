import { NoticePage } from '@/screens/notices';

export default async function Page({ params }: PageProps<'/manage/[propertyId]/notices/new'>) {
  const { propertyId } = await params;

  return (
    <NoticePage
      propertyId={propertyId}
      mode={'create'}
    />
  );
}
