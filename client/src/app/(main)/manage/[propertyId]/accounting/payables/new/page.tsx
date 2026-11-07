import { PayablePage } from '@/screens/accounting/payables';

export const metadata = {
  title: '미지급 등록'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <PayablePage
      propertyId={propertyId}
    />
  );
}
