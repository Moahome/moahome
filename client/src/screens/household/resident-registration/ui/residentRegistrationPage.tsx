'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { ResidentRegistrationForm } from '@/features/resident-management';
import styles from './residentRegistrationPage.module.css';

/** 모바일의 독립 등록 주소를 제공하고 직접 접근에서도 현재 관리소장에게만 폼을 표시합니다. */
export function ResidentRegistrationPage({
  propertyId
}: {
  propertyId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const listPath = `/manage/${propertyId}/residents`;
  if (!context.data) return (
    <LoadingState
      title={'등록 권한을 확인하고 있어요.'}
    />
  );

  return (
    <section
      className={styles.page}
      aria-labelledby={'resident-registration-title'}
    >
      <header
        className={styles.header}
      >
        <p>
          주민 관리
        </p>
        <h1
          id={'resident-registration-title'}
        >
          주민 등록
        </h1>
        <p>
          주민 정보와 동·호수를 입력해주세요.
        </p>
      </header>
      <div
        className={styles.card}
      >
        <ResidentRegistrationForm
          propertyId={propertyId}
          onCancel={() => router.replace(listPath)}
          onSaved={() => {
            void queryClient.invalidateQueries({
              predicate: (query) => ['property-residents', 'property-units'].includes(String(query.queryKey[0]))
          && query.queryKey[1] === session.data?.id && query.queryKey[2] === propertyId
            });
            router.replace(`${listPath}?registered=1`);
          }}
        />
      </div>
    </section>
  );
}
