import { ServiceHeader } from '@/widgets/service-header';
import { SystemAdminMemberDetail } from '@/widgets/system-admin';
export function SystemMemberDetailPage({ userId }: { userId: string }) {
  return (
    <SystemAdminMemberDetail
      userId={userId}
      header={(
        <ServiceHeader
          mobileBack={{
            href: '/admin',
            label: '뒤로가기',
            title: '회원 상세'
          }}
        />
      )}
    />
  );
}
