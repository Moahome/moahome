'use client';

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
  cancelBankTransfer,
  connectBankTransfer
} from '../../../api/bankingApi';
import type {
  BankingTransaction,
  BankingWorkspaceData
} from '../../../api/bankingApiTypes';
import styles from './transferDetail.module.css';

/** PC 모달과 모바일 독립 상세에서 같은 이체 연결·해제·실패 재시도 흐름을 사용합니다. */
export function TransferDetail({ propertyId, row, data, presentation = 'modal', onClose }: {
  propertyId: string; row: BankingTransaction; data: BankingWorkspaceData; presentation?: 'modal' | 'page'; onClose?: () => void;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const [target, setTarget] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function label(accountId: string) {
    const account = data.accounts?.find((account) => account.id === accountId);
    return account ? `${account.bankName} ····${account.last4}${account.alias ? ` · ${account.alias}` : ''}` : '관리계좌';
  }
  /** 요청 UUID를 실패 재시도에 유지하고 같은 금액이라는 이유만으로 상대 통장을 자동 확정하지 않습니다. */
  async function submit() {
    if (pending.current || (!row.transferId && !target)) return;
    pending.current = true;setBusy(true);setError('');setSaved(false);
    try {
      const result = row.transferId ? await cancelBankTransfer(propertyId, row.transferId) : await connectBankTransfer(propertyId, {
        id: requestId,
        outgoingId: row.direction === 'EXPENSE' ? row.id : target,
        incomingId: row.direction === 'INCOME' ? row.id : target
      });
      cache.setQueryData(['banking-workspace', session.data?.id, propertyId], result);
      await cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
      setTarget('');setRequestId(crypto.randomUUID());setSaved(true);onClose?.();
    } catch (failure) { setError(bankingError(failure)); }
    finally { pending.current = false;setBusy(false); }
  }
  const content = (
    <>
      <div
        className={styles.body}
      >
        <p>
          {`${label(row.accountId)} · ${row.date} ${row.time ?? ''} · ${row.payer} · ${formatWon(row.amount)}`}
        </p>
        <p>
          통장 간 이동은 수납·운영 수입·지출과 동별 보유금을 변경하지 않습니다.
        </p>
        {row.transferId ? <p>
          상대 통장과 연결한 이체입니다. 잘못 연결했다면 연결을 해제하고 다시 선택하세요.
        </p> : (
          <Dropdown
            label={'상대 통장 거래'}
            value={target}
            onChange={(value) => { setTarget(value);setRequestId(crypto.randomUUID()); }}
            disabled={busy}
            options={data.rows.filter((candidate) => candidate.transferCandidate && !candidate.transferId && candidate.accountId !== row.accountId
            && candidate.direction !== row.direction && candidate.amount === row.amount).map((candidate) => ({
              value: candidate.id,
              label: `${label(candidate.accountId)} · ${candidate.date} · ${candidate.payer} · ${formatWon(candidate.amount)}`
            }))}
          />
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
            이체 연결을 저장했어요.
          </p>
        )}
      </div>
      <footer
        className={styles.actions}
      >
        <Button
          disabled={busy || (!row.transferId && !target)}
          loading={busy}
          onClick={() => void submit()}
        >
          {row.transferId ? '이체 연결 해제' : '이체 연결'}
        </Button>
      </footer>
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
        description={'두 통장의 입출금 원본을 연결합니다.'}
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
        <h2>
          계좌 간 이체
        </h2>
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
