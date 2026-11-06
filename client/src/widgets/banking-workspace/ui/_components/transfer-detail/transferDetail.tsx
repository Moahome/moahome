'use client';

import {
  getBankAccountLabel,
  TransferAllocationEditor,
  calculateTransferAllocation,
  type TransferAllocationPart
} from '@/entities/banking';

import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';

import { useSession } from '@/entities/session';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRef,
  useState
} from 'react';
import {
  bankingError,
  allocateBankTransfer,
  cancelBankTransfer,
  postBankTransfer
} from '../../../api/bankingApi';
import type {
  BankingTransaction,
  BankingWorkspaceData
} from '../../../api/bankingApiTypes';
import styles from './transferDetail.module.css';

/** 한쪽 은행 원본에서 상대 통장을 지정하고 PC·모바일에서 양쪽 장부 반영과 취소를 함께 처리합니다. */
export function TransferDetail({ propertyId, row, data, presentation = 'modal', onClose }: {
  propertyId: string; row: BankingTransaction; data: BankingWorkspaceData; presentation?: 'modal' | 'page'; onClose?: () => void;
}) {
  const session = useSession();
  const propertyScope = capturePropertyQueryScope(session.data?.id, propertyId);
  const cache = useQueryClient();
  const [target, setTarget] = useState('');
  const [allocations, setAllocations] = useState<TransferAllocationPart[]>(row.transferAllocations ?? []);
  const allocation = calculateTransferAllocation(row.amount, allocations, data.buildings.length > 0);
  const needsAllocation = row.status !== 'CANCELED' && data.buildings.length > 0 && !row.transferAllocations?.length;
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function label(accountId: string) {
    const account = data.accounts?.find((account) => account.id === accountId);
    return account ? getBankAccountLabel(account) : '관리계좌';
  }
  /** 요청 UUID를 실패 재시도에 유지하고 같은 금액이라는 이유만으로 상대 통장을 자동 확정하지 않습니다. */
  async function submit(saveAllocation = false) {
    if (pending.current || row.status === 'CANCELED' || (!row.transferId && !target)) return;
    if ((!row.transferId || saveAllocation) && allocation.error) { setError(allocation.error); return; }
    pending.current = true;setBusy(true);setError('');setSaved(false);
    try {
      let result: BankingWorkspaceData;
      if (saveAllocation && row.transferId) {
        result = await allocateBankTransfer(propertyId, row.transferId, {
          allocations: allocation.allocations
        });
      } else if (row.transferId) {
        result = await cancelBankTransfer(propertyId, row.transferId);
      } else {
        result = await postBankTransfer(propertyId, {
          id: requestId,
          transactionId: row.id,
          counterpartAccountId: target,
          ...(allocation.allocations.length ? {
            allocations: allocation.allocations
          } : {})
        });
      }
      setPropertyQueryData(cache, ['banking-workspace', session.data?.id, propertyId], result, propertyScope);
      await Promise.all(['banking-balances', 'monthly-settlement', 'dashboard', 'income-statement'].map((key) => cache.invalidateQueries({
        queryKey: [key, session.data?.id, propertyId]
      })));
      setTarget('');setRequestId(crypto.randomUUID());setSaved(true);onClose?.();
    } catch (failure) { setError(bankingError(failure)); }
    finally { pending.current = false;setBusy(false); }
  }
  const connectedAccount = row.transferAccountId ?? target;
  const fromAccount = row.direction === 'INCOME' ? connectedAccount : row.accountId;
  const toAccount = row.direction === 'INCOME' ? row.accountId : connectedAccount;
  const content = (
    <>
      <div
        className={styles.body}
      >
        <section
          className={styles.summary}
          aria-label={'이체 요약'}
        >
          <div
            className={styles['summary-main']}
          >
            <div
              className={styles['summary-account']}
            >
              <span
                className={styles['account-icon']}
              >
                <ServiceIcon
                  name={'bank'}
                  size={28}
                />
              </span>
              <div>
                <span>
                  출금 통장
                </span>
                <strong>
                  {fromAccount ? label(fromAccount) : '출금 통장 선택'}
                </strong>
                <small>
                  {row.payer}
                </small>
              </div>
            </div>
            <span
              className={styles['summary-arrow']}
              aria-hidden={'true'}
            >
              →
            </span>
            <div
              className={styles['summary-amount']}
            >
              <span>
                이체금액
              </span>
              <strong>
                {formatWon(row.amount)}
              </strong>
              <small>
                입금 통장 ·
                {toAccount ? label(toAccount) : '입금 통장 선택'}
              </small>
            </div>
          </div>
          <div
            className={styles['summary-meta']}
          >
            <p>
              <ServiceIcon
                name={'closing'}
              />
              <span>
                거래일시
              </span>
              <b>
                {row.date}
                {' '}
                {row.time ?? ''}
              </b>
            </p>
          </div>
        </section>
        <div
          className={styles.notice}
        >
          <ServiceIcon
            name={'info'}
            size={24}
          />
          <p>
            양쪽 통장 잔액과 선택한 동의 보유금을 함께 옮깁니다.
          </p>
        </div>
        {!row.transferId && (
          <Dropdown
            label={row.direction === 'INCOME' ? '출금 통장' : '입금 통장'}
            value={target}
            onChange={(value) => { setTarget(value);setRequestId(crypto.randomUUID()); }}
            disabled={busy}
            options={(data.accounts ?? []).filter((account) => account.id !== row.accountId && account.status === 'ACTIVE').map((account) => ({
              value: account.id,
              label: getBankAccountLabel(account)
            }))}
          />
        )}
        {needsAllocation && (
          <section
            className={styles['allocation-section']}
          >
            <h3>
              동별 이체금액
            </h3>
            <p>
              선택한 동의 보유금을 상대 통장의 같은 동으로 옮깁니다.
            </p>
            <TransferAllocationEditor
              key={row.id}
              total={row.amount}
              buildings={data.buildings}
              value={allocations}
              onChange={setAllocations}
              disabled={busy}
            />
          </section>
        )}
        {Boolean(row.transferAllocations?.length) && (
          <section
            className={styles['allocation-section']}
          >
            <h3>
              동별 이동금액
            </h3>
            <dl
              className={styles['allocation-list']}
            >
              {[...row.transferAllocations!].sort((a, b) => (data.buildings.find((building) => building.id === a.buildingId)?.label ?? '').localeCompare(data.buildings.find((building) => building.id === b.buildingId)?.label ?? '', 'ko', {
                numeric: true
              })).map((part) => (
                <div
                  key={part.buildingId}
                >
                  <dt>
                    {data.buildings.find((building) => building.id === part.buildingId)?.label ?? '동'}
                  </dt>
                  <dd>
                    {formatWon(part.amount)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {row.status === 'CANCELED' && (
          <p
            role={'status'}
          >
            취소된 이체입니다. 양쪽 통장과 동별 이동을 함께 제외했습니다.
          </p>
        )}
        {error && (
          <p
            role={'alert'}
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role={'status'}
          >
            저장했어요.
          </p>
        )}
      </div>
      {row.status !== 'CANCELED' && (
        <footer
          className={styles.actions}
        >
          {row.transferId && row.status !== 'CANCELED' && (
            <Button
              variant={'outline'}
              tone={'danger'}
              disabled={busy}
              onClick={() => void submit()}
            >
              {row.automaticTransfer ? '이체 취소' : '연결 해제'}
            </Button>
          )}
          {(!row.transferId || needsAllocation) && (
            <Button
              disabled={busy || row.status === 'CANCELED' || (!row.transferId && !target) || (needsAllocation && Boolean(allocation.error))}
              loading={busy}
              onClick={() => void submit(Boolean(row.transferId))}
            >
              저장
            </Button>
          )}
        </footer>
      )}
    </>
  );
  if (presentation === 'page') return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={'통장 관리'}
        title={'계좌 간 이체'}
        titleId={'transfer-title'}
        description={'통장과 동별 자금 이동을 확인합니다.'}
      />
      {content}
    </section>
  );
  return (
    <ClientModal
      className={styles.modal}
      aria-label={'계좌 간 이체'}
      busy={busy}
      onClose={() => onClose?.()}
    >
      <header
        className={styles.header}
      >
        <div
          className={styles['header-title']}
        >
          <span>
            <ServiceIcon
              name={'bank'}
              size={26}
            />
          </span>
          <h2>
            계좌 간 이체
          </h2>
        </div>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'이체 상세 닫기'}
          disabled={busy}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      {content}
    </ClientModal>
  );
}
