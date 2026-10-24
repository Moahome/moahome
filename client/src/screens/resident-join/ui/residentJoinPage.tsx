'use client';

import { useRouter } from 'next/navigation';
import { InvitationCodeForm } from '@/features/member-management';
import { ServiceHeader } from '@/widgets/service-header';
import styles from './residentJoinPage.module.css';

/** 공통·개인 초대코드 검증 후 이름 필수·연락처 선택 신청과 개인 정보 확인을 같은 입력 흐름으로 제공합니다. */
export function ResidentJoinPage({ propertyId }: { propertyId?: string }) {
  const router = useRouter();
  return (
    <div>
      <ServiceHeader
        mobileBack={{
          href: '/start',
          label: '시작으로 돌아가기',
          title: '주민으로 참여하기'
        }}
      />
      <main
        className={styles.page}
      >
        <InvitationCodeForm
          responsive
          onClose={() => router.replace('/start')}
          propertyId={propertyId}
          onComplete={() => router.push('/start')}
        />
      </main>
    </div>
  );
}
