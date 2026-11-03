import { ServiceHeader } from '@/widgets/service-header';
import { SystemAdminList } from '@/widgets/system-admin';
export function SystemAdministratorListPage() {
  return (
    <SystemAdminList
      header={(
        <ServiceHeader />
      )}
      administrators
    />
  );
}
