'use client';

import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import { useSession } from '@/entities/session';
import { getManagementDashboardPath } from '@/entities/property';
import {
  PropertyRegistrationFlow,
  hasPendingRegistration
} from '@/features/property-registration';
import {
  useManagementEntry,
  useResidentProperties
} from '@/features/enter-service';
import { InvitationCodeForm } from '@/features/member-management';
import { ClientModal } from '@/shared/ui/client-modal';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { ApiError } from '@/shared/api';
import { NeighborhoodIllustration } from '@/shared/ui/neighborhood-illustration';
import { ServiceHeader } from '@/widgets/service-header';
import { StartIntro } from './_components/start-intro/startIntro';
import { NoticeDialog } from '@/shared/ui/notice-dialog';
import { StartSessionState } from './_components/start-session-state/startSessionState';
import { PendingRequestCard } from './_components/pending-request-card/pendingRequestCard';
import { StartCard } from './_components/start-card/startCard';
import styles from './startPage.module.css';
import motion from './startMotion.module.css';

/** 세션을 확인하고 명시적 추가 진입에서는 기존 관리대상으로의 자동 이동을 생략합니다. */
export function StartPage({ mode = 'initial' }: { mode?: 'initial' | 'additional' }) {
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const invitationTitleRef = useRef<HTMLHeadingElement>(null);
  const additional = mode === 'additional';
  const entryPath = additional ? '/properties/add' : '/start';
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRegistration = searchParams.get('registration');
  const registration = requestedRegistration === 'administrator' ? 'units' : requestedRegistration;
  const completionRequestId = searchParams.get('requestId');
  const registrationStep = registration === 'basic' || registration === 'units' || registration === 'account' || registration === 'fees' || registration === 'review' || registration === 'complete' ? registration : null;
  const isSetupStep = registrationStep !== null && registrationStep !== 'basic';
  const hasPendingSubmission = Boolean(session.data && hasPendingRegistration(session.data.id));
  const registeredProperty = useManagementEntry(session.data?.id, !additional && registrationStep === null && !hasPendingSubmission);
  const residentProperties = useResidentProperties(session.data?.id, !additional && !registrationStep && !hasPendingSubmission && registeredProperty.isSuccess && !registeredProperty.data);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState({
    title: '',
    message: ''
  });
  const requiresLogin = session.isError && session.error instanceof ApiError
    && (session.error.status === 401 || session.error.code === 'ACCOUNT_UNAVAILABLE');

  useEffect(() => {
    // 인증 거부가 확정된 경우에만 이동해 일시적인 조회 장애를 로그아웃으로 처리하지 않습니다.
    if (!session.isFetching && requiresLogin) {
      router.replace('/login');
    }
  }, [router, session.isFetching, requiresLogin]);

  useEffect(() => {
    if (additional || registrationStep || hasPendingSubmission || registeredProperty.isFetching) return;
    const error = registeredProperty.error ?? residentProperties.error;
    if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) {
      window.location.replace('/login');
      return;
    }
    if (registeredProperty.isSuccess && registeredProperty.data) {
      router.replace(getManagementDashboardPath(registeredProperty.data.propertyId));
    }
  }, [additional, registrationStep, hasPendingSubmission, registeredProperty.data, registeredProperty.error, registeredProperty.isFetching, registeredProperty.isSuccess, residentProperties.error, router]);

  useEffect(() => {
    if (additional || registrationStep || hasPendingSubmission || registeredProperty.data || registeredProperty.isFetching || !residentProperties.data?.length) return;
    router.replace('/resident');
  }, [additional, registrationStep, hasPendingSubmission, registeredProperty.data, registeredProperty.isFetching, residentProperties.data, router]);

  useEffect(() => {
    /** 브라우저가 문서를 보관하기 전에 개인정보를 가려 로그아웃 뒤 복원 프레임에도 노출하지 않습니다. */
    function hideLeavingPage() {
      if (!pageRef.current) return;
      // 펼친 상세의 visibility: visible에도 숨김이 유지되도록 부모의 렌더링 자체를 중단합니다.
      pageRef.current.style.display = 'none';
      pageRef.current.inert = true;
    }

    /** bfcache 복원은 이전 로그인 메모리도 복원하므로 새 문서에서 세션과 결과 권한을 재검증합니다. */
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

  /** 아직 제공하지 않는 기능은 대기 요청이나 알림이 있다고 가정하지 않고 준비 상태를 안내합니다. */
  function showNotice(title: string, message: string) {
    setNotice({
      title,
      message
    });
    dialogRef.current?.showModal();
  }

  /** 사용자 재시도는 진행 중인 토큰 교체 요청을 취소하지 않고 기존 요청을 공유합니다. */
  function retryRestore() {
    void session.refetch({
      cancelRefetch: false
    });
  }

  if (!session.isSuccess) {
    return (
      <StartSessionState
        error={!session.isFetching && !requiresLogin ? session.error : null}
        onRetry={retryRestore}
      />
    );
  }

  if (!additional && !registrationStep && !hasPendingSubmission && (!registeredProperty.isSuccess || registeredProperty.isFetching || registeredProperty.data)) {
    return (
      <StartSessionState
        kind={'property'}
        error={registeredProperty.isFetching ? null : registeredProperty.error}
        onRetry={() => void registeredProperty.refetch({
          cancelRefetch: false
        })}
      />
    );
  }

  if (!additional && !registrationStep && !hasPendingSubmission && (!residentProperties.isSuccess || residentProperties.isFetching || residentProperties.data.length > 0)) {
    return (
      <StartSessionState
        kind={'property'}
        error={residentProperties.isFetching ? null : residentProperties.error}
        onRetry={() => void residentProperties.refetch({
          cancelRefetch: false
        })}
      />
    );
  }

  return (
    <div
      ref={pageRef}
      className={styles.page}
    >
      <div
        className={isSetupStep && registrationStep !== 'complete' ? styles['setup-header'] : undefined}
      >
        <ServiceHeader
          user={session.data}
          onNotify={() => showNotice('알림', '알림 기능을 준비하고 있어요.')}
        />
      </div>
      {registrationStep && (
        <PropertyRegistrationFlow
          key={session.data.id}
          userId={session.data.id}
          entryPath={entryPath}
          step={registrationStep}
          completionRequestId={completionRequestId}
          onClose={() => router.replace(entryPath, {
            scroll: false
          })}
          onDashboard={(propertyId) => router.push(getManagementDashboardPath(propertyId))}
        />
      )}
      {!isSetupStep && (
        <main
          className={styles.main}
        >
          <StartIntro
            additional={additional}
          />
          <div
            className={styles['start-options']}
          >
            <StartCard
              kind={'create'}
              onSelect={() => router.push(`${entryPath}?registration=basic`, {
                scroll: false
              })}
            />
            <StartCard
              kind={'join'}
              invitation={additional}
              onSelect={() => {
                // 최초 시작과 추가 참여 모두 PC에서는 현재 화면의 공통 모달을 엽니다.
                if (!window.matchMedia('(max-width: 767px)').matches) {
                  setInvitationOpen(true);
                  return;
                }
                router.push(additional ? '/invitations' : '/join');
              }}
            />
          </div>
          <PendingRequestCard
            onSelect={() => showNotice('승인 대기 중인 요청', '가입 요청 조회 기능을 준비하고 있어요.')}
          />
        </main>
      )}
      <div
        className={styles['background-left']}
      >
        <NeighborhoodIllustration />
      </div>
      <div
        className={styles['background-right']}
      >
        <NeighborhoodIllustration />
      </div>
      <footer
        className={isSetupStep ? styles.footer : `${styles.footer} ${motion.reveal}`}
      >
        우리의 공간이 더 특별해지는, 모아홈
      </footer>
      {invitationOpen && (
        <ClientModal
          className={styles['invitation-modal']}
          aria-labelledby={'invitation-modal-title'}
          initialFocusRef={invitationTitleRef}
          busy={invitationBusy}
          onClose={() => setInvitationOpen(false)}
        >
          <header>
            <h2
              id={'invitation-modal-title'}
              ref={invitationTitleRef}
              tabIndex={-1}
            >
              초대코드로 참여하기
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'초대코드 입력 닫기'}
              disabled={invitationBusy}
              onClick={() => setInvitationOpen(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </header>
          <InvitationCodeForm
            onBusyChange={setInvitationBusy}
            onComplete={() => setInvitationOpen(false)}
          />
        </ClientModal>
      )}
      <NoticeDialog
        dialogRef={dialogRef}
        title={notice.title}
        message={notice.message}
      />
    </div>
  );
}
