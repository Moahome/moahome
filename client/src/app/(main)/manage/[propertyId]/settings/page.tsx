import { SettingsPage } from '@/screens/settings';

export default async function Page({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  return (
    <SettingsPage
      propertyId={propertyId}
    />
  );
}

