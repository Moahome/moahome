import { BankingWorkspace } from '@/widgets/banking-workspace';

export function BankingUploadPage({ propertyId }: { propertyId: string }) {
  return (
    <BankingWorkspace
      propertyId={propertyId}
      view={'upload'}
    />
  );
}
