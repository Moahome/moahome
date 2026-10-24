'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/entities/session';
import { BrandMark } from '@/shared/ui/brand-mark';
import {
  ApiError,
  isServerConnectionError
} from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import styles from './loginCallbackPage.module.css';

type CallbackState =
  | {
      status: 'loading';
    }
  | {
      status: 'error';
      message: string;
      canRetry: boolean;
    };

/** 일시 장애와 재로그인이 필요한 실패를 구분해 안전한 사용자 안내를 제공합니다. */
function getFailureState(error: unknown): CallbackState {
  if (!(error instanceof ApiError)) {
    return {
      status: 'error',
      message: '지금은 로그인할 수 없어요. 잠시 후 다시 로그인해 주세요.',
      canRetry: false,
    };
  }

  if (error.status === 503 || error.code === 'NETWORK_ERROR') {
    return {
      status: 'error',
      message: '로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
      canRetry: true,
    };
  }

  if (error.code === 'BROWSER_UNSUPPORTED') {
    return {
      status: 'error',
      message: '브라우저를 업데이트한 뒤 다시 로그인해 주세요.',
      canRetry: false,
    };
  }

  if (error.code === 'ACCOUNT_UNAVAILABLE') {
    return {
      status: 'error',
      message: '현재 이용할 수 없는 계정이에요.',
      canRetry: false,
    };
  }

  return {
    status: 'error',
    message: '로그인을 완료하지 못했어요. 다시 로그인해 주세요.',
    canRetry: false,
  };
}

export function LoginCallbackPage() {
  const session = useSession();
  const router = useRouter();
  let state: CallbackState = {
    status: 'loading'
  };

  if (!session.isFetching && session.isError) {
    state = getFailureState(session.error);
  }

  useEffect(() => {
    // 본인 정보까지 확인한 후 이동하며 콜백을 이력에 남기지 않아 뒤로 가기로 복원을 반복하지 않습니다.
    if (!session.isFetching && session.isSuccess) {
      router.replace('/start');
    }
  }, [router, session.isFetching, session.isSuccess]);

  /** 재시도가 가능한 조회 실패나 일시 장애에 한해 세션 복원을 다시 요청합니다. */
  function retryRestore() {
    // 진행 중인 Rotation을 취소하면 응답이 유실될 수 있어 같은 요청을 끝까지 공유합니다.
    void session.refetch({
      cancelRefetch: false
    });
  }

  let title = '로그인하고 있어요';
  let description = '잠시만 기다려 주세요.';

  if (state.status === 'error') {
    title = '로그인을 확인해 주세요';
    description = state.message;
  }

  if (state.status === 'error' && state.canRetry && isServerConnectionError(session.error)) return (
    <main
      className={styles.page}
    >
      <ServerConnectionError
        error={session.error}
        onRetry={retryRestore}
      />
    </main>
  );

  return (
    <main
      className={styles.page}
    >
      <section
        className={styles.card}
        aria-labelledby={'callback-title'}
        aria-busy={state.status === 'loading'}
      >
        <Link
          href={'/'}
          className={styles.brand}
          aria-label={'모아홈 홈으로'}
        >
          <BrandMark />
          <span>
            모아홈
          </span>
        </Link>
        <div
          className={styles.content}
          role={state.status === 'error' ? 'alert' : 'status'}
          aria-labelledby={'callback-title'}
          aria-live={'polite'}
        >
          <div
            className={styles.indicator}
            data-status={state.status}
            aria-hidden={'true'}
          >
            {state.status === 'loading' && (
              <span
                className={styles.spinner}
              />
            )}
            {state.status === 'error' && (
              <span>
                !
              </span>
            )}
          </div>
          <h1
            id={'callback-title'}
          >
            {title}
          </h1>
          <p>
            {description}
          </p>
        </div>
        {state.status === 'error' && (
          <div
            className={styles.actions}
          >
            {state.canRetry && (
              <button
                type={'button'}
                className={styles.action}
                onClick={retryRestore}
              >
                다시 시도
              </button>
            )}
            <Link
              href={'/login'}
              className={styles['secondary-action']}
            >
              로그인 화면으로
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
