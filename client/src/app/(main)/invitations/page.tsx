import type { Metadata } from 'next';
import { InvitationClaimPage } from '@/screens/invitation-claim';
import {
  MANAGER_INVITATION_METADATA,
  RESIDENT_SHARE_METADATA
} from '@/app/metadata/shareMetadata';

/** 코드는 fragment에 유지하고 공개된 공유 용도로만 미리보기를 선택해 초대 정보를 조회하지 않습니다. */
export async function generateMetadata({ searchParams }: PageProps<'/invitations'>): Promise<Metadata> {
  const { type } = await searchParams;

  return type === 'resident' ? RESIDENT_SHARE_METADATA : MANAGER_INVITATION_METADATA;
}

export default function Page() {
  return (
    <InvitationClaimPage />
  );
}

