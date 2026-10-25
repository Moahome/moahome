'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { BankIcon } from '@/entities/banking';
import { useSession } from '@/entities/session';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  getBankAccountDetail,
  revealBankAccountNumber
} from '../../../api/bankAccountDetailApi';
import type { AccountBalance } from '../../../api/bankingBalanceApiTypes';
import { getAccountBalanceDisplay } from '../../../model/accountBalance';
import styles from './bankAccountDetails.module.css';

const STATUS_LABELS = {
  ACTIVE: '사용 중',
  INACTIVE: '사용 중지',
  CLOSED: '사용 종료'
};

/** PC·모바일에서 같은 통장 정보를 표시하고 전체 번호는 공개 중인 컴포넌트에만 보관합니다. */
export function BankAccountDetails({ propertyId, account, month }: {
  propertyId: string;
  account: AccountBalance;
  month: string;
}) {
  const session = useSession();
  const query = useQuery({
    queryKey: ['bank-account-detail', session.data?.id, propertyId, account.id],
    queryFn: ({ signal }) => getBankAccountDetail(propertyId, account.id, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  /** 닫힌 상세의 늦은 공개 응답을 버리고 실패하면 마스킹과 재시도 버튼을 유지합니다. */
  async function toggleNumber() {
    if (number !== null) {
      setNumber(null);
      return;
    }
    if (!query.data || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const revealed = await revealBankAccountNumber(query.data);
      if (active.current) setNumber(revealed);
    } catch {
      if (active.current) setError('계좌번호를 확인하지 못했어요. 통장 정보를 다시 조회한 뒤 시도해주세요.');
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (query.isPending) return (
    <LoadingState
      title={'통장 정보를 불러오고 있어요.'}
    />
  );
  if (!query.data || query.isError) return (
    <div
      className={styles.state}
      role={'alert'}
    >
      <p>
        통장 정보를 확인하지 못했어요. 접근 권한과 통장 정보를 확인해주세요.
      </p>
      <Button
        variant={'outline'}
        onClick={() => { setNumber(null); void query.refetch(); }}
      >
        다시 조회
      </Button>
    </div>
  );
  const detail = query.data;
  const display = getAccountBalanceDisplay(account);

  return (
    <div
      className={styles.content}
    >
      <header
        className={styles.identity}
      >
        <BankIcon
          bankCode={detail.bankCode}
        />
        <div>
          <h3>
            {detail.bankName}
          </h3>
          {detail.alias && (
            <p>
              {detail.alias}
            </p>
          )}
          <small>
            {STATUS_LABELS[detail.status]}
            {detail.isPrimary ? ' · 기본 납부계좌' : ''}
          </small>
        </div>
      </header>
      <dl
        className={styles.fields}
      >
        <div>
          <dt>
            예금주
          </dt>
          <dd>
            {detail.holderName}
          </dd>
        </div>
        <div>
          <dt>
            계좌번호
          </dt>
          <dd
            className={styles.number}
          >
            <span>
              {number ?? `···· ${detail.last4}`}
            </span>
            <Button
              size={'sm'}
              variant={'outline'}
              loading={busy}
              aria-pressed={number !== null}
              onClick={() => void toggleNumber()}
            >
              {number !== null ? '숨기기' : '전체 보기'}
            </Button>
          </dd>
        </div>
      </dl>
      {error && (
        <div
          className={styles.state}
          role={'alert'}
        >
          <p>
            {error}
          </p>
          <Button
            variant={'outline'}
            onClick={() => { setNumber(null); setError(''); void query.refetch(); }}
          >
            통장 정보 다시 조회
          </Button>
        </div>
      )}
      <section
        className={styles.balance}
        aria-label={'통장 잔액 정보'}
      >
        <p>
          {display.calculated ? '계산 잔액' : '은행 확인 잔액'}
        </p>
        <strong>
          {display.amount === null ? '은행 확인 자료 없음' : formatWon(display.amount)}
        </strong>
        <small>
          {month}
          {' '}
          조회 기준
        </small>
        {display.description && (
          <small>
            {display.calculated ? display.description : `${display.description} 확인`}
          </small>
        )}
        <p>
          {display.amount === null ? '잔액이 0원이라는 뜻은 아닙니다.' : '실시간 조회가 아닙니다.'}
        </p>
      </section>
    </div>
  );
}
