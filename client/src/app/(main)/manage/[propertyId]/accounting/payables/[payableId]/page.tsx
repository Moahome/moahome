import { PayablePage } from '@/screens/accounting/payables';

export const metadata = {
  title: '미지급 상세'
};

export default async function Page({ params }: { params: Promise<{ propertyId: string; payableId: string }> }) {
  const { propertyId, payableId } = await params;
  return (
    <PayablePage
      propertyId={propertyId}
      payableId={payableId}
    />
  );
}
