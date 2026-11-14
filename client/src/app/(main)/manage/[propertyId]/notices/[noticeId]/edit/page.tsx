import { NoticePage } from '@/screens/notices';

export default async function Page({ params }: PageProps<'/manage/[propertyId]/notices/[noticeId]/edit'>) {
  const { propertyId, noticeId } = await params;

  return (
    <NoticePage
      propertyId={propertyId}
      noticeId={noticeId}
      mode={'edit'}
    />
  );
}
