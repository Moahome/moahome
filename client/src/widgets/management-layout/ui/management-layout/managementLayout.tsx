'use client';

import {
  useEffect,
  useRef,
  type ReactNode
} from 'react';
import { useSession } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { useManagementContext } from '@/features/enter-service';
import { ApiError } from '@/shared/api';
import { ManagementAccessState } from '../_components/management-access-state/managementAccessState';
import { ManagementSidebar } from '../_components/management-sidebar/managementSidebar';
import styles from './managementLayout.module.css';

type HeaderSlots = {
  mobileContent: (onNavigate: () => void) => ReactNode;
};

/** 현재 관리자 역할을 서버에서 확인한 대상의 공통 메뉴와 임시 본문을 연결합니다. */
export function ManagementLayout({
  propertyId,
  header,
  children,
}: {
  propertyId: string;
  header: (slots: HeaderSlots) => ReactNode;
  children: ReactNode;
}) {
  const session = useSession();
  const property = useManagementContext(session.data?.id, propertyId);
  const pageRef = useRef<HTMLDivElement>(null);
  const error = session.error ?? property.error;
  const requiresLogin = error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE');

  useEffect(() => {
    if (requiresLogin) window.location.replace('/login');
  }, [requiresLogin]);

  useEffect(() => {
    /** 캐시 복원 전 개인정보를 숨기고 새 문서에서 로그인과 등록 결과를 다시 확인합니다. */
    function hideLeavingPage() {
      if (!pageRef.current) return;
      pageRef.current.style.display = 'none';
      pageRef.current.inert = true;
    }

    function revalidateRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }

    window.addEventListener('pagehide', hideLeavingPage);
    window.addEventListener('pageshow', revalidateRestoredPage);
    return () => {
      window.removeEventListener('pagehide', hideLeavingPage);
      window.removeEventListener('pageshow', revalidateRestoredPage);
    };
  }, []);

  let content;
  if (!isPropertyId(propertyId)) {
    content = (
      <ManagementAccessState
        title={'등록된 곳의 주소가 올바르지 않아요.'}
      />
    );
  } else if (requiresLogin || session.isFetching || property.isFetching || (!error && !property.isSuccess)) {
    content = (
      <ManagementAccessState
        title={'관리할 곳을 확인하고 있어요.'}
        loading
      />
    );
  } else if (property.error instanceof ApiError && property.error.code === 'ACCESS_DENIED') {
    content = (
      <ManagementAccessState
        title={'이곳에 접근할 수 없어요.'}
      />
    );
  } else if (error) {
    content = (
      <ManagementAccessState
        title={'관리할 곳을 확인하지 못했어요.'}
        onRetry={() => void (session.isSuccess ? property : session).refetch({
          cancelRefetch: false
        })}
      />
    );
  } else if (!session.data || !property.data) {
    content = (
      <ManagementAccessState
        title={'이곳에 접근할 수 없어요.'}
      />
    );
  } else {
    content = (
      <ManagementFrame
        key={session.data.id}
        propertyId={propertyId}
        header={header}
      >
        {children}
      </ManagementFrame>
    );
  }

  return (
    <div
      ref={pageRef}
    >
      {content}
    </div>
  );
}

/** 검증 상태와 화면 틀의 수명을 나누어 확인 전에는 메뉴·이전 대상 이름을 표시하지 않습니다. */
function ManagementFrame({
  propertyId,
  header,
  children,
}: {
  propertyId: string;
  header: (slots: HeaderSlots) => ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.shell}
    >
      <div
        className={styles['service-header']}
      >
        {header({
          mobileContent: (onNavigate) => (
            <>
              <ManagementSidebar
                propertyId={propertyId}
                onNavigate={onNavigate}
                variant={'drawer'}
              />
            </>
          ),
        })}
      </div>
      <div
        className={styles.layout}
      >
        <aside
          className={styles.sidebar}
        >
          <ManagementSidebar
            propertyId={propertyId}
          />
        </aside>
        <div
          className={styles.workspace}
        >
          <main
            className={styles.main}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
