import { NoticePage } from '@/screens/notices';

export default async function Page({ params }: PageProps<'/manage/[propertyId]/notices'>) {
  const { propertyId } = await params;

  return (
    <NoticePage
      propertyId={propertyId}
    />
  );
}
