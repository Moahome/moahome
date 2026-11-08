'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  CURRENT_USER_QUERY_KEY,
  clearSession,
  getWithdrawalStatus,
  notifyAccountWithdrawal,
  requestAccountWithdrawal,
  type CurrentUser
} from '@/entities/session';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ListCard } from '@/shared/ui/list-card';
import { RequestError } from '@/shared/ui/server-connection-error';
import { LoadingState } from '@/shared/ui/state-message';
import styles from './accountWithdrawal.module.css';

/** 즉시 삭제와 구분한 30일 유예 안내를 확인받고, 성공할 때만 현재 로그인과 계정 캐시를 비웁니다. */
export function AccountWithdrawal({ userId, disabled }: { userId: string; disabled: boolean }) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <section
      className={styles.section}
      aria-labelledby={'withdrawal-title'}
    >
      <h2
        id={'withdrawal-title'}
      >
        회원 탈퇴
      </h2>
      <ListCard>
        <div
          className={styles.card}
        >
          <p>
            탈퇴 후 30일간 복구할 수 있어요.
          </p>
          <Button
            variant={'outline'}
            tone={'danger'}
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            탈퇴하기
          </Button>
        </div>
      </ListCard>
      {open && (
        <WithdrawalDialog
          userId={userId}
          onClose={() => setOpen(false)}
          onComplete={() => {
            if (cache.getQueryData<CurrentUser>(CURRENT_USER_QUERY_KEY)?.id !== userId) return;
            notifyAccountWithdrawal(userId);
            clearSession();
            cache.clear();
            window.location.replace('/login?withdrawal=requested');
          }}
        />
      )}
    </section>
  );
}

function WithdrawalDialog({ userId, onClose, onComplete }: {
  userId: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const status = useQuery({
    queryKey: ['session', 'withdrawal', userId],
    queryFn: getWithdrawalStatus,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    networkMode: 'always'
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const valid = status.data?.userId === userId;

  async function submit() {
    if (busy || status.isFetching || !valid || !status.data?.canWithdraw) return;
    setBusy(true);
    setFailure('');
    try {
      await requestAccountWithdrawal();
      onComplete();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) {
        window.location.replace('/login');
        return;
      }
      setFailure(error instanceof ApiError && error.status === 409
        ? '참여 정보가 변경됐어요. 아래 내용을 다시 확인해주세요.'
        : '탈퇴 신청을 완료하지 못했어요. 잠시 후 다시 시도해주세요.');
      if (error instanceof ApiError && error.status === 409) void status.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClientModal
      className={styles.dialog}
      aria-labelledby={'withdrawal-dialog-title'}
      busy={busy}
      onClose={onClose}
    >
      <h2
        id={'withdrawal-dialog-title'}
      >
        회원 탈퇴
      </h2>
      {status.isPending || status.isFetching ? (
        <LoadingState
          layout={'inline'}
          title={'탈퇴 가능 여부를 확인하고 있어요.'}
        />
      ) : status.isError ? (
        <RequestError
          error={status.error}
          onRetry={() => void status.refetch()}
        />
      ) : !valid ? (
        <p
          role={'alert'}
        >
          계정 정보를 다시 확인해주세요.
        </p>
      ) : !status.data.canWithdraw ? (
        <div
          className={styles.details}
        >
          <p>
            관리 중인 곳의 관리소장을 인계한 뒤 탈퇴해주세요.
          </p>
          <ul>
            {status.data.managedProperties.map((property) => (
              <li
                key={property.id}
              >
                <Link
                  href={`/manage/${property.id}/settings`}
                  onClick={onClose}
                >
                  {property.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className={styles.details}
        >
          <p>
            탈퇴 신청이 완료되면 즉시 로그아웃되며 서비스 이용이 중단됩니다.
          </p>
          <ul>
            <li>
              30일 이내에 같은 카카오 계정으로 로그인하면 계정을 복구할 수 있습니다.
            </li>
            <li>
              30일이 지나면 이름·프로필 사진·소셜 연결정보가 삭제되어 복구할 수 없습니다.
            </li>
            <li>
              주민 명부·관리비·수납 등 공동 관리 기록은 유지됩니다.
            </li>
          </ul>
        </div>
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
          variant={'outline'}
          disabled={busy}
          onClick={onClose}
        >
          취소
        </Button>
        {valid && status.data?.canWithdraw && (
          <Button
            variant={'outline'}
            tone={'danger'}
            loading={busy}
            disabled={status.isFetching || status.isError}
            onClick={() => void submit()}
          >
            탈퇴 신청
          </Button>
        )}
      </div>
    </ClientModal>
  );
}
