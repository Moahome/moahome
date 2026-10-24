'use client';

import { useRouter } from 'next/navigation';
import { InvitationCodeForm } from '@/features/member-management';
import { ServiceHeader } from '@/widgets/service-header';
import styles from './invitationClaimPage.module.css';

/** 직접 접근·모바일에서는 독립 페이지로 같은 초대코드 폼을 제공합니다. */
export function InvitationClaimPage() {
  const router = useRouter();


  return (
    <div>
      <ServiceHeader
        mobileBack={{
          href: '/properties/add',
          label: '등록 및 참여로 돌아가기',
          title: '초대코드로 참여하기'
        }}
      />
      <main
        className={styles.page}
      >
        <InvitationCodeForm
          responsive
          onClose={() => router.replace('/properties/add')}
          onComplete={() => router.push('/start')}
        />
      </main>
    </div>
  );
}
