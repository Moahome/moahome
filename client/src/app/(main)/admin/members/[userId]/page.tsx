import type { Metadata } from 'next';
import { SystemMemberDetailPage } from '@/screens/system-admin/member-detail';
export const metadata: Metadata = {
  title: '회원 상세',
  robots: {
    index: false,
    follow: false
  }
};
export default async function Page({ params }: PageProps<'/admin/members/[userId]'>) { const { userId } = await params; return (
  <SystemMemberDetailPage
    userId={userId}
  />
); }
