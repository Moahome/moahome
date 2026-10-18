'use client';

import {
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { isServerConnectionError } from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { ListHeader } from '@/shared/ui/list-header';
import { Toast } from '@/shared/ui/toast';
import { formatWon } from '@/shared/lib/format';
import {
  bankingError,
  getBankingWorkspace,
  confirmBankingExpense,
  type ExpenseDraft
} from '../../api/bankingApi';
import {
  createExpenseDraft,
  calculateExpenseAllocation,
  sortExpenseLabels
} from '../../model/expenseAllocation';
import { TransferDetail } from '../_components/transfer-detail/transferDetail';
import { AllocationEditor } from '@/entities/banking';
import styles from './bankingExpensePage.module.css';

/** PC 모달과 모바일 상세에서 같은 원본·확정 지출을 조회하고 저장 중에는 닫기를 막습니다. */
export function BankingExpensePage({ propertyId, transactionId, presentation = 'page', onClose }: {
  propertyId: string;
  transactionId: string;
  presentation?: 'page' | 'modal';
  onClose?: () => void;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const workspace = useQuery({
    queryKey,
    queryFn: () => getBankingWorkspace(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [edited, setEdited] = useState<ExpenseDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(false);
  function present(content: ReactNode) {
    if (presentation === 'page') return (
      <section
        className={styles.page}
      >
        <ListHeader
          menu={'통장 관리'}
          title={'지출 상세'}
          titleId={'expense-title'}
          description={'거래 내용과 각 동의 지출액을 확인합니다.'}
        />
        <div
          className={styles.body}
        >
          {content}
        </div>
      </section>
    );
    return (
      <ClientModal
        className={styles.modal}
        aria-labelledby={'expense-title'}
        onClose={() => onClose?.()}
        busy={busy}
        closeOnOutsideClick
      >
        <header
          className={styles.header}
        >
          <div>
            <p>
              통장 관리
            </p>
            <h2
              id={'expense-title'}
            >
              지출 상세
            </h2>
          </div>
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'지출 상세 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        </header>
        <div
          className={styles.body}
        >
          {content}
        </div>
      </ClientModal>
    );
  }
  if (workspace.isPending) return present(
    <p
      role={'status'}
    >
      거래 정보를 불러오고 있어요.
    </p>
  );
  if (!workspace.data && isServerConnectionError(workspace.error)) return present(
    <ServerConnectionError
      onRetry={() => { void workspace.refetch({
        cancelRefetch: false
      }); }}
    />
  );
  if (!workspace.data) return present(
    <section>
      <h3>
        거래 조회 오류
      </h3>
      <p
        role={'alert'}
      >
        {bankingError(workspace.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => { void workspace.refetch(); }}
      >
        다시 시도
      </Button>
    </section>
  );
  const transfer = workspace.data.rows.find((item) => item.id === transactionId && item.transferCandidate);
  if (transfer) return (
    <TransferDetail
      propertyId={propertyId}
      row={transfer}
      data={workspace.data}
      presentation={presentation}
      onClose={onClose}
    />
  );
  const row = workspace.data.rows.find((item) => item.id === transactionId && item.direction === 'EXPENSE');
  if (!row) return present(
    <section>
      <h3>
        출금 내역을 찾을 수 없습니다.
      </h3>
      <p>
        현재 관리대상의 거래를 확인해주세요.
      </p>
    </section>
  );
  const draft = edited ?? createExpenseDraft(row, workspace.data);
  async function confirm() {
    if (!row || busyRef.current) return;
    const calculated = calculateExpenseAllocation(row.amount, draft);
    if (calculated.error) { setError(calculated.error); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await confirmBankingExpense(propertyId, row.id, {
        ...draft,
        allocations: calculated.allocations
      });
      cache.setQueryData(queryKey, saved); setEdited(null); setNotice(true);
      // 원장에서 열린 지출을 확정하면 해당 동의 잔고와 누적 원장도 다시 조회합니다.
      void cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
    } catch (failure) { setError(bankingError(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const expenseName = row.expense?.category ?? row.payer;
  const originalDetails = [
    {
      label: '출금액',
      icon: 'coins',
      value: formatWon(row.amount),
      kind: 'amount'
    },
    {
      label: '거래 후 잔액',
      icon: 'bank',
      value: row.balance === null ? '원본에 없음' : formatWon(row.balance),
      kind: 'balance'
    },
    {
      label: '거래일시',
      icon: 'closing',
      value: `${row.date}${row.time ? ` ${row.time}` : ''}`,
      kind: 'date'
    }
  ] as const;
  return present(
    <>
      <header
        className={styles['expense-header']}
      >
        <span
          className={styles['expense-icon']}
          aria-hidden={'true'}
        >
          <ServiceIcon
            name={'building'}
            size={30}
          />
        </span>
        <div
          className={styles['expense-title']}
        >
          <h3>
            {expenseName}
          </h3>
          {expenseName !== row.payer && (
            <p>
              {row.payer}
            </p>
          )}
        </div>
        {row.expense && (
          <span
            className={styles.status}
          >
            <ServiceIcon
              name={'check'}
              size={16}
            />
            지출 확정 완료
          </span>
        )}
      </header>
      <dl
        className={styles['transaction-cards']}
        aria-label={'거래 정보'}
      >
        {originalDetails.map((item) => (
          <div
            key={item.label}
            data-kind={item.kind}
          >
            <dt>
              <ServiceIcon
                name={item.icon}
                size={20}
              />
              {item.label}
            </dt>
            <dd>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {row.expense ? (
        <section
          className={styles.confirmed}
          aria-labelledby={'expense-allocation-title'}
        >
          <h4
            id={'expense-allocation-title'}
            className={styles['allocation-title']}
          >
            <ServiceIcon
              name={'building'}
              size={21}
            />
            동별 배분 내역
          </h4>
          <ul
            className={styles['allocation-list']}
            aria-label={'동별 배분 내역'}
          >
            {sortExpenseLabels(row.expense.allocations).map((part, index) => (
              <li
                key={part.buildingId ?? `external-${index}`}
              >
                <span
                  className={styles['target-icon']}
                  aria-hidden={'true'}
                >
                  <ServiceIcon
                    name={'building'}
                    size={24}
                  />
                </span>
                <div
                  className={styles.target}
                >
                  <strong>
                    {part.label}
                  </strong>
                  {part.percentage && <small>
                    {`${Number(part.percentage)}%`}
                  </small>}
                </div>
                <strong
                  className={styles.amount}
                >
                  {formatWon(part.amount)}
                </strong>
              </li>
            ))}
          </ul>
          {row.expense.note && (
            <p
              className={styles.note}
            >
              {row.expense.note}
            </p>
          )}
        </section>
      )
        : (
          <>
            <AllocationEditor
              total={row.amount}
              draft={draft}
              buildings={workspace.data.buildings}
              disabled={busy}
              onChange={setEdited}
            />
            {error && (
              <p
                role={'alert'}
              >
                {error}
              </p>
            )}
            <div
              className={styles.actions}
            >
              <Button
                disabled={busy}
                loading={busy}
                onClick={() => { void confirm(); }}
              >
                지출 확정
              </Button>
            </div>
          </>
        )}
      {notice && (
        <Toast
          message={'지출을 확정했어요.'}
          onClose={() => setNotice(false)}
        />
      )}
    </>
  );
}
