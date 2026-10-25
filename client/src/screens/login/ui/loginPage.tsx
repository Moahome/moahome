'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/entities/session';
import {
  getKakaoLoginErrorMessage,
  KakaoLoginButton
} from '@/features/kakao-login';
import { BrandMark } from '@/shared/ui/brand-mark';
import {
  ApiError,
  isServerConnectionError
} from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import { Button } from '@/shared/ui/button';
import { NeighborhoodIllustration } from '@/shared/ui/neighborhood-illustration';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { LoginFooter } from './_components/login-footer/loginFooter';
import styles from './loginPage.module.css';

/** 세션 확인이 끝난 비로그인 사용자에게만 로그인 수단을 표시하고 정상 사용자는 시작 화면으로 이동합니다. */
export function LoginPage({ errorCode }: { errorCode?: string }) {
  const session = useSession();
  const router = useRouter();
  const errorMessage = getKakaoLoginErrorMessage(errorCode);
  const canLogin = session.isError && session.error instanceof ApiError
    && (session.error.status === 401 || session.error.status === 403
      || session.error.code === 'LOGIN_REQUIRED' || session.error.code === 'ACCOUNT_UNAVAILABLE');
  const isChecking = session.isPending || session.isFetching || session.isSuccess;
  const unsupportedBrowser = session.error instanceof ApiError && session.error.code === 'BROWSER_UNSUPPORTED';

  useEffect(() => {
    // 본인 정보까지 검증한 뒤 로그인 URL을 이력에서 교체해 뒤로 가기로 로그인 폼에 돌아오지 않게 합니다.
    if (!session.isFetching && session.isSuccess) {
      router.replace('/start');
    }
  }, [router, session.isFetching, session.isSuccess]);

  /** 일시 장애를 비로그인으로 간주하지 않고 진행 중인 토큰 교체를 취소하지 않은 채 재시도합니다. */
  function retrySession() {
    void session.refetch({
      cancelRefetch: false
    });
  }

  if (isChecking || !canLogin) {
    if (!isChecking && isServerConnectionError(session.error)) return (
      <main
        className={`${styles.page} ${styles['session-state']}`}
      >
        <ServerConnectionError
          error={session.error}
          onRetry={retrySession}
        />
      </main>
    );
    let description = '잠시만 기다려 주세요.';

    if (!isChecking) {
      description = unsupportedBrowser
        ? '브라우저를 업데이트한 뒤 다시 로그인해 주세요.'
        : '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }

    return (
      <main
        className={`${styles.page} ${styles['session-state']}`}
        aria-busy={isChecking}
      >
        <div
          role={isChecking ? 'status' : 'alert'}
          aria-live={'polite'}
        >
          <h1>
            {isChecking ? '로그인 상태를 확인하고 있어요' : '로그인 상태를 확인해 주세요'}
          </h1>
          <p>
            {description}
          </p>
        </div>
        {!isChecking && !unsupportedBrowser && (
          <Button
            onClick={retrySession}
          >
            다시 시도
          </Button>
        )}
        <Link
          href={'/start'}
        >
          시작 화면으로
        </Link>
      </main>
    );
  }

  return (
    <div
      className={styles.page}
    >
      <a
        className={styles['skip-link']}
        href={'#login'}
      >
        로그인으로 바로가기
      </a>
      <header
        className={styles.header}
      >
        <Link
          href={'/start'}
          className={styles.brand}
          aria-label={'모아홈 홈으로'}
        >
          <BrandMark />
          <span>
            모아홈
          </span>
        </Link>
        <p>
          우리의 공간이 더 특별해지는, 모아홈
        </p>
      </header>

      <main
        className={styles.main}
      >
        <section
          className={styles.introduction}
          aria-labelledby={'brand-title'}
        >
          <div
            className={styles['intro-copy']}
          >
            <h1
              id={'brand-title'}
            >
              <span
                className={styles['mobile-brand-mark']}
              >
                <BrandMark />
              </span>
              모아홈
            </h1>
            <p
              className={styles.tagline}
            >
              함께 만드는 더 좋은 우리 집
            </p>
            <p
              className={styles.description}
            >
              아파트와 빌라의 관리비 조회부터
              <br />
              공동체 관리까지, 모아홈이 더 편리한
              <br />
              주거 생활을 도와드립니다.
            </p>
            <p
              className={styles['mobile-description']}
            >
              관리비 조회와 관리 업무를 시작해보세요.
            </p>
          </div>
          <div
            className={styles.neighborhood}
          >
            <p
              className={styles['neighbor-note']}
            >
              좋은 이웃,
              <br />
              <span>
                더 좋은 일상
              </span>
              <svg
                viewBox={'0 0 38 30'}
                fill={'none'}
                aria-hidden={'true'}
              >
                <path
                  d={'m6 4-4 11M20 10l-9 12M34 20l-13 7'}
                />
              </svg>
            </p>
            <NeighborhoodIllustration />
          </div>
        </section>

        <div
          className={styles['login-area']}
        >
          <section
            className={styles['login-card']}
            id={'login'}
            aria-labelledby={'login-title'}
          >
            <div
              className={styles['card-heading']}
            >
              <h2
                id={'login-title'}
              >
                로그인
              </h2>
              <p>
                관리비 조회와 관리 업무를 시작해보세요.
              </p>
            </div>
            {errorMessage && (
              <p
                className={styles['login-error']}
                role={'alert'}
              >
                {errorMessage}
              </p>
            )}
            <KakaoLoginButton />
            <div
              className={styles['service-intro']}
            >
              <div
                className={styles.divider}
              >
                <span>
                  또는
                </span>
              </div>
              <Link
                href={'/start'}
                className={styles['intro-link']}
              >
                <ServiceIcon
                  name={'document'}
                />
                시작 화면으로
              </Link>
            </div>
            <p
              className={styles['invitation-note']}
            >
              <ServiceIcon
                name={'info'}
              />
              <span>
                초대받은 주민은 로그인 후 초대코드로 참여할 수 있어요.
              </span>
            </p>
          </section>
          <LoginFooter />
        </div>
      </main>
    </div>
  );
}
