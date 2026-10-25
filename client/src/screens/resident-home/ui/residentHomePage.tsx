'use client';

import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import {
  useEffect,
  useRef
} from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useSession } from '@/entities/session';
import {
  getManagementDashboardPath,
  isPropertyId
} from '@/entities/property';
import {
  useManagementEntry,
  useResidentProperties,
  usePropertyAccessGuard
} from '@/features/enter-service';
import { ServiceHeader } from '@/widgets/service-header';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Button } from '@/shared/ui/button';
import { ApiError } from '@/shared/api';
import { RequestError } from '@/shared/ui/server-connection-error';
import styles from './residentHomePage.module.css';

/** 현재 주민 참여를 우선 확인하고 주민 참여가 없으면 접근 가능한 진입점으로 이동합니다. */
export function ResidentHomePage() {
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const session = useSession();
  const params = useSearchParams();
  const propertyId = params.get('propertyId') ?? '';
  const scoped = params.has('propertyId');
  const access = usePropertyAccessGuard({
    userId: session.data?.id,
    propertyId,
    routeKey: `/resident?propertyId=${propertyId}`,
    area: 'resident'
  });
  const properties = useResidentProperties(session.data?.id, !scoped);
  // 주민 참여가 남아 있으면 이 목록을 유지합니다. 다른 대상의 관리자 역할을 전역 역할로 적용하지 않습니다.
  const needsEntry = !scoped && properties.isFetchedAfterMount && properties.isSuccess
    && !properties.isFetching && properties.data.length === 0;
  const management = useManagementEntry(session.data?.id, needsEntry);
  const rows = scoped ? (access.ready && access.data ? [access.data] : []) : properties.data;
  const failure = session.error ?? (scoped ? access.error : properties.error ?? (needsEntry ? management.error : null));
  const denied = failure instanceof ApiError && (failure.status === 401 || failure.code === 'ACCOUNT_UNAVAILABLE');
  useEffect(() => { if (denied) router.replace('/login'); }, [denied, router]);
  useEffect(() => {
    // 새 주민 목록이 실제로 비었을 때만 현재 관리 목록까지 확인해 승격과 전체 참여 종료를 구분합니다.
    if (!needsEntry || !management.isFetchedAfterMount || !management.isSuccess || management.isFetching) return;
    router.replace(management.data ? getManagementDashboardPath(management.data.propertyId) : '/start');
  }, [needsEntry, management.isFetchedAfterMount, management.isSuccess, management.isFetching, management.data, router]);
  useEffect(() => {
    /** 브라우저 기록 캐시에 남은 참여 정보는 새 문서의 현재 세션·권한으로 재검증합니다. */
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
  const waiting = denied || !session.data || (scoped ? !access.ready && !access.blocked && !access.error
    : !properties.isFetchedAfterMount || !properties.error && !properties.data?.length);

  /** 실패한 조회만 재시도하고 일시 장애나 취소를 참여 종료로 해석하지 않습니다. */
  function retry() {
    if (!session.data) return void session.refetch({
      cancelRefetch: false
    });
    if (scoped) return void access.revalidate();
    if (needsEntry && management.error) return void management.refetch({
      cancelRefetch: false
    });
    void properties.refetch({
      cancelRefetch: false
    });
  }
  if (scoped && !isPropertyId(propertyId)) return (
    <StateMessage
      title={'등록된 곳의 주소가 올바르지 않아요.'}
    />
  );
  if (scoped && access.blocked) return (
    <StateMessage
      title={access.data?.role === 'RESIDENT' && !access.data.residentEligible ? '주민 연결을 확인해주세요.' : '현재 접근 가능한 화면으로 이동하고 있어요.'}
      actions={(
        <Button
          onClick={() => router.replace('/start')}
        >
          시작 화면으로
        </Button>
      )}
    />
  );
  return (
    <div
      ref={pageRef}
    >
      {failure && !denied && (
        <main
          className={styles['error-state']}
        >
          <RequestError
            error={failure}
            onRetry={retry}
            inputPreserved={Boolean(rows?.length)}
          />
        </main>
      )}
      <div
        hidden={Boolean(failure && !denied)}
        inert={Boolean(failure && !denied)}
      >
        <ServiceHeader
          homeHref={scoped ? `/resident?propertyId=${propertyId}` : '/resident'}
          homeLabel={'주민 홈'}
        />
        <main
          className={styles.page}
        >
          <ListHeader
            menu={'모아홈'}
            title={'주민 홈'}
            titleId={'resident-home-title'}
            description={'우리 집 소식을 만나는 공간입니다.'}
          />
          {waiting ? (
            <LoadingState
              title={'주민 참여 정보를 확인하고 있어요.'}
            />
          ) : rows?.length ? (
            <>
              <section
                className={styles.welcome}
                aria-label={'가입한 곳'}
              >
                <ServiceIcon
                  name={'home'}
                />
                <div>
                  <h2>
                    모아홈에 오신 것을 환영해요
                  </h2>
                  <p>
                    주민 가입이 완료되었어요.
                  </p>
                </div>
              </section>
              <ul
                className={styles.properties}
              >
                {rows.map((property) => (
                  <li
                    key={property.propertyId}
                  >
                    <ServiceIcon
                      name={'building'}
                    />
                    <Button
                      variant={'ghost'}
                      onClick={() => router.push(`/resident?propertyId=${property.propertyId}`)}
                    >
                      {property.name}
                    </Button>
                    <span>
                      참여 중
                    </span>
                    <Button
                      variant={'outline'}
                      aria-label={`${property.name} 설정`}
                      onClick={() => router.push(`/resident/settings?propertyId=${property.propertyId}`)}
                    >
                      설정
                    </Button>
                  </li>
                ))}
              </ul>
              <StateMessage
                variant={'coming-soon'}
                title={'주민 서비스를 준비하고 있어요'}
                description={'현재는 가입한 곳을 확인할 수 있는 임시 주민 홈입니다.'}
              />
            </>
          ) : (
            <section
              className={styles.placeholder}
            >
              <h2>
                아직 가입한 곳이 없어요
              </h2>
              <p>
                초대를 받았다면 참여를 진행해주세요. 신청한 경우 관리자 승인을 기다려주세요.
              </p>
              <Button
                onClick={() => router.push('/start')}
              >
                참여하기
              </Button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
