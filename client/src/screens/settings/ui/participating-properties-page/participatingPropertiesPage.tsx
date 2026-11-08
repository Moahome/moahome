'use client';

import {
  useEffect,
  useRef
} from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { isPropertyId } from '@/entities/property';
import { useSession } from '@/entities/session';
import { ServiceHeader } from '@/widgets/service-header';
import { ApiError } from '@/shared/api';
import { ListHeader } from '@/shared/ui/list-header';
import { LoadingState } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ParticipatingProperties } from '../_components/participating-properties/participatingProperties';
import styles from './participatingPropertiesPage.module.css';

/** 모바일에서는 참여 목록을 독립 페이지로 열고 실제 출발 화면으로 돌아갈 수 있게 합니다. */
export function ParticipatingPropertiesPage() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const pageRef = useRef<HTMLDivElement>(null);
  const requestedId = params.get('propertyId') ?? '';
  const currentPropertyId = isPropertyId(requestedId) ? requestedId : undefined;
  const denied = session.error instanceof ApiError
    && (session.error.status === 401 || session.error.code === 'ACCOUNT_UNAVAILABLE');

  useEffect(() => {
    if (denied) router.replace('/login');
  }, [denied, router]);

  useEffect(() => {
    function hideLeavingPage() {
      if (!pageRef.current) return;
      pageRef.current.hidden = true;
      pageRef.current.inert = true;
    }
    // 이전 계정의 참여 목록이 문서 캐시에서 노출되지 않게 현재 세션과 참여를 다시 확인합니다.
    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener('pagehide', hideLeavingPage);
    window.addEventListener('pageshow', restorePage);
    return () => {
      window.removeEventListener('pagehide', hideLeavingPage);
      window.removeEventListener('pageshow', restorePage);
    };
  }, []);

  let content;
  if (session.isPending || denied) {
    content = (
      <LoadingState
        title={'계정 정보를 확인하고 있어요.'}
      />
    );
  } else if (session.isError) {
    content = (
      <RequestError
        error={session.error}
        retrying={session.isFetching}
        onRetry={() => void session.refetch({
          cancelRefetch: false
        })}
      />
    );
  } else {
    content = (
      <ParticipatingProperties
        key={session.data.id}
        userId={session.data.id}
        currentPropertyId={currentPropertyId}
        presentation={'page'}
      />
    );
  }

  return (
    <div
      ref={pageRef}
    >
      <ServiceHeader
        mobileBack={{
          href: '/start',
          label: '뒤로가기',
          title: '참여 중인 곳'
        }}
      />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={'설정'}
          title={'참여 중인 곳'}
          titleId={'participating-properties-page-title'}
          description={'관리하거나 주민으로 참여 중인 곳을 선택하세요.'}
        />
        {content}
      </main>
    </div>
  );
}
