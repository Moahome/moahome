'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  getAccountRecovery,
  logoutSession,
  recoverAccount
} from '@/entities/session';
import { KakaoLoginButton } from '@/features/kakao-login';
import { ApiError } from '@/shared/api';
import { useHistoryRevalidation } from '@/shared/lib/navigation-history';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button } from '@/shared/ui/button';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { LoadingState } from '@/shared/ui/state-message';
import styles from './accountRecoveryPage.module.css';

/** 정상 앱 세션을 복원하지 않고 동일 소셜 계정의 짧은 복구 전용 쿠키로 유예 상태를 조회합니다. */
export function AccountRecoveryPage() {
  const cache = useQueryClient();
  const pageRef = useHistoryRevalidation<HTMLElement>();
  const account = useQuery({
    queryKey: ['session', 'account-recovery'],
    queryFn: getAccountRecovery,
    retry: false,
    refetchOnWindowFocus: false,
    networkMode: 'always'
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  /** 서버 복구와 쿠키 교체가 모두 성공하면 전체 앱을 새로 열어 이전 사용자 캐시를 재사용하지 않습니다. */
  async function recover() {
    if (busy || !account.data) return;
    setBusy(true);
    setFailure('');
    try {
      await recoverAccount(account.data.csrfToken);
      cache.clear();
      window.location.replace('/start');
    } catch (error) {
      setFailure('계정을 복구하지 못했어요. 잠시 후 다시 시도해주세요.');
      if (error instanceof ApiError && [401, 403, 410].includes(error.status)) void account.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setFailure('');
    try {
      await logoutSession();
      cache.clear();
      window.location.replace('/login');
    } catch {
      setFailure('로그아웃하지 못했어요. 다시 시도해주세요.');
      setBusy(false);
    }
  }

  const denied = account.error instanceof ApiError && [401, 403, 410].includes(account.error.status);
  const expired = account.error instanceof ApiError && account.error.status === 410;
  let content;
  if (account.isPending) {
    content = (
      <LoadingState
        title={'계정 복구 정보를 확인하고 있어요.'}
      />
    );
  } else if (account.isError && !denied) {
    content = (
      <RequestError
        error={account.error}
        onRetry={() => void account.refetch()}
      />
    );
  } else if (denied) {
    content = (
      <>
        <h1>
          {expired ? '계정 복구 기간이 지났어요' : '복구할 계정으로 로그인해주세요'}
        </h1>
        <p>
          {expired ? '30일 유예 기간이 지나 기존 계정을 복구할 수 없습니다.' : '탈퇴를 신청한 것과 같은 카카오 계정으로 로그인해주세요.'}
        </p>
        <KakaoLoginButton />
      </>
    );
  } else if (account.data) {
    const restored = account.data.state === 'RESTORED';
    const until = account.data.recoverableUntil ? new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(account.data.recoverableUntil)) : '';
    content = (
      <>
        <span
          className={styles.symbol}
          aria-hidden
        >
          <ServiceIcon
            name={'reset'}
            size={32}
          />
        </span>
        <h1>
          {restored ? '계정이 복구되었어요' : '계정을 복구할까요?'}
        </h1>
        <p>
          <strong>
            {account.data.displayName}
            님
          </strong>
        </p>
        {!restored && (
          <>
            <p>
              탈퇴 신청으로 서비스 이용이 중단된 상태입니다.
            </p>
            <div
              className={styles.deadline}
            >
              <span>
                복구 가능 기한
              </span>
              <strong>
                {until}
              </strong>
            </div>
            <p>
              복구하면 탈퇴 신청이 취소되고 계정을 다시 사용할 수 있습니다. 그사이 회수된 참여 권한은 자동 복구되지 않습니다.
            </p>
          </>
        )}
        {failure && (
          <p
            className={styles.error}
            role={'alert'}
          >
            {failure}
          </p>
        )}
        <div
          className={styles.actions}
        >
          <Button
            loading={busy}
            onClick={() => void recover()}
          >
            {restored ? '계속하기' : '계정 복구'}
          </Button>
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={() => void logout()}
          >
            로그아웃
          </Button>
        </div>
      </>
    );
  }

  return (
    <main
      ref={pageRef}
      className={styles.page}
    >
      <section
        className={styles.card}
      >
        <Link
          href={'/login'}
          className={styles.brand}
          aria-label={'모아홈 로그인'}
        >
          <BrandMark />
          <span>
            모아홈
          </span>
        </Link>
        {content}
      </section>
    </main>
  );
}
