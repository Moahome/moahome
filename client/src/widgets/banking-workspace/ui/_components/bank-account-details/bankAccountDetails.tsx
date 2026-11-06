'use client';

import { LoadingState } from '@/shared/ui/state-message';

import {
  BankIcon,
  getBankAccountLabel
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
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
import {
  getAccountBalanceDisplay,
  getBalancePeriodLabel
} from '../../../model/accountBalance';
import styles from './bankAccountDetails.module.css';

const STATUS_LABELS = {
  ACTIVE: '사용 중',
  INACTIVE: '사용 중지',
  CLOSED: '사용 종료'
};

/** PC·모바일에서 같은 통장 정보를 표시하고 전체 번호는 공개 중인 컴포넌트에만 보관합니다. */
export function BankAccountDetails({ propertyId, account, month, onInitial }: {
  propertyId: string;
  account: AccountBalance;
  month: string;
  onInitial?: () => void;
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
        <span
          className={styles['bank-icon']}
        >
          <BankIcon
            bankCode={detail.bankCode}
          />
        </span>
        <div
          className={styles['bank-identity']}
        >
          <h3>
            {getBankAccountLabel(detail)}
          </h3>
          {detail.alias && (
            <p>
              {detail.bankName}
            </p>
          )}
          <div
            className={styles.badges}
          >
            <span
              className={styles.status}
              data-status={detail.status}
            >
              {STATUS_LABELS[detail.status]}
            </span>
            {detail.isPrimary && (
              <span
                className={styles.primary}
              >
                기본 납부계좌
              </span>
            )}
          </div>
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
        <div
          className={styles['balance-heading']}
        >
          <h4>
            {display.label}
          </h4>
          <InfoTooltip
            label={`${display.label} 도움말`}
            title={display.label}
            size={'sm'}
            compact
          >
            {display.calculated ? `${getBalancePeriodLabel(month)}의 장부 잔액입니다. 시작 금액에 유효 입출금과 이체·취소를 반영합니다.` : '장부 잔액을 계산할 시작 금액과 거래 자료를 확인해주세요.'}
            {display.description}
          </InfoTooltip>
        </div>
        <strong
          className={styles.amount}
          data-negative={display.amount !== null && BigInt(display.amount) < BigInt(0)}
        >
          {display.amount === null ? '확인된 잔액 없음' : formatWon(display.amount)}
        </strong>
        <small>
          {display.calculated ? getBalancePeriodLabel(month) : display.description}
        </small>
        {onInitial && (
          <div
            className={styles['balance-actions']}
          >
            {onInitial && (
              <Button
                variant={'text'}
                size={'sm'}
                onClick={onInitial}
              >
                초기 잔액 정정
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
