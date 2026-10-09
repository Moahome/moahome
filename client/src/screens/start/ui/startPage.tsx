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
import { PropertyRegistrationFlow } from '@/features/property-registration';
import { ApiError } from '@/shared/api';
import { NeighborhoodIllustration } from '@/shared/ui/neighborhood-illustration';
import { StartHeader } from './_components/start-header/startHeader';
import { StartIntro } from './_components/start-intro/startIntro';
import { StartNoticeDialog } from './_components/start-notice-dialog/startNoticeDialog';
import { StartSessionState } from './_components/start-session-state/startSessionState';
import { PendingRequestCard } from './_components/pending-request-card/pendingRequestCard';
import { StartCard } from './_components/start-card/startCard';
import styles from './startPage.module.css';
import motion from './startMotion.module.css';

/** 세션과 본인 정보가 확인된 사용자에게만 시작 화면을 표시합니다. */
export function StartPage() {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const registration = searchParams.get('registration');
  const completionRequestId = searchParams.get('requestId');
  const registrationStep = registration === 'basic' || registration === 'units' || registration === 'account' || registration === 'fees' || registration === 'review' || registration === 'complete' ? registration : null;
  const isSetupStep = registrationStep !== null && registrationStep !== 'basic';
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

  return (
    <div
      ref={pageRef}
      className={styles.page}
    >
      <div
        className={isSetupStep && registrationStep !== 'complete' ? styles['setup-header'] : undefined}
      >
        <StartHeader
          user={session.data}
          onNotify={() => showNotice('알림', '알림 기능을 준비하고 있어요.')}
        />
      </div>
      {registrationStep && (
        <PropertyRegistrationFlow
          key={session.data.id}
          userId={session.data.id}
          step={registrationStep}
          completionRequestId={completionRequestId}
          onClose={() => router.replace('/start', {
            scroll: false
          })}
          onDashboard={() => showNotice('대시보드 준비 중', '관리대상 등록은 완료되었습니다. 관리자 대시보드는 준비 중이에요.')}
        />
      )}
      {!isSetupStep && (
        <main
          className={styles.main}
        >
          <StartIntro />
          <div
            className={styles['start-options']}
          >
            <StartCard
              kind={'create'}
              onSelect={() => router.push('/start?registration=basic', {
                scroll: false
              })}
            />
            <StartCard
              kind={'join'}
              onSelect={() => showNotice('초대코드로 참여하기', '초대코드 참여 기능을 준비하고 있어요.')}
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
      <StartNoticeDialog
        dialogRef={dialogRef}
        title={notice.title}
        message={notice.message}
      />
    </div>
  );
}
