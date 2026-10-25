'use client';

import { useSearchParams } from 'next/navigation';
import {
  useEffect,
  useRef
} from 'react';
import { useSession } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { usePropertyAccessGuard } from '@/features/enter-service';
import { ServiceHeader } from '@/widgets/service-header';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import { usePreservedWorkspace } from '@/shared/lib/preserved-workspace';
import { ApiError } from '@/shared/api';
import { SettingsPage } from '../settings-page/settingsPage';
import styles from './residentSettingsPage.module.css';

/** 주민 홈에서 선택한 곳의 현재 주민 권한을 검증하고 공통 설정 화면을 제공합니다. */
export function ResidentSettingsPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLElement>(null);
  const params = useSearchParams();
  const propertyId = params.get('propertyId') ?? '';
  const session = useSession();
  const access = usePropertyAccessGuard({
    userId: session.data?.id,
    propertyId,
    routeKey: `/resident/settings?propertyId=${propertyId}`,
    area: 'resident'
  });
  const failure = session.error ?? access.error;
  const requiresLogin = failure instanceof ApiError && (failure.status === 401 || failure.code === 'ACCOUNT_UNAVAILABLE');
  usePreservedWorkspace(Boolean(failure) && access.ready, workspaceRef, errorRef);

  useEffect(() => {
    if (requiresLogin) window.location.replace('/login');
  }, [requiresLogin]);

  useEffect(() => {
    function hideLeavingPage() {
      if (!pageRef.current) return;
      pageRef.current.hidden = true;
      pageRef.current.inert = true;
    }
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

  if (!isPropertyId(propertyId)) return (
    <StateMessage
      title={'등록된 곳의 주소가 올바르지 않아요.'}
    />
  );
  if (access.blocked) return (
    <StateMessage
      title={'현재 접근 가능한 화면으로 이동하거나 주민 연결을 확인해주세요.'}
    />
  );

  return (
    <div
      ref={pageRef}
    >
      {failure && (
        <main
          ref={errorRef}
          className={styles.page}
          tabIndex={-1}
        >
          <RequestError
            error={failure}
            inputPreserved={access.ready}
            onRetry={() => { if (session.data) void access.revalidate(); else void session.refetch(); }}
          />
        </main>
      )}
      <div
        ref={workspaceRef}
        hidden={Boolean(failure)}
        inert={Boolean(failure)}
      >
        <ServiceHeader
          homeHref={`/resident?propertyId=${propertyId}`}
          homeLabel={'주민 홈'}
        />
        <main
          className={styles.page}
        >
          {access.ready ? (
            <SettingsPage
              propertyId={propertyId}
            />
          ) : (
            <LoadingState
              title={'주민 참여 정보를 확인하고 있어요.'}
            />
          )}
        </main>
      </div>
    </div>
  );
}
