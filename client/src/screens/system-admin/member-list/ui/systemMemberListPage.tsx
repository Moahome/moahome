import { ServiceHeader } from '@/widgets/service-header';
import { SystemAdminList } from '@/widgets/system-admin';
export function SystemMemberListPage() {
  return (
    <SystemAdminList
      header={(
        <ServiceHeader />
      )}
    />
  );
}
