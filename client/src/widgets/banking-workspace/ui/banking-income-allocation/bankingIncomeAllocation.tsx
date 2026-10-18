'use client';

import {
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { Toast } from '@/shared/ui/toast';
import {
  allocateBankingIncome,
  bankingError,
  getBankingWorkspace,
  type ExpenseDraft
} from '../../api/bankingApi';
import {
  createExpenseDraft,
  calculateExpenseAllocation,
} from '../../model/expenseAllocation';
import {
  AllocationEditor,
  IncomeAllocationSummary
} from '@/entities/banking';
import styles from './bankingIncomeAllocation.module.css';

/** 확정 기타 입금만 배분하며 원본 한 건·입금 전액을 동별 몫으로 나누어 저장합니다. */
export function BankingIncomeAllocation({ propertyId, paymentId, onBusyChange }: { propertyId: string; paymentId: string; onBusyChange?: (busy: boolean) => void }) {
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
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(false);
  const row = workspace.data?.rows.find((item) => item.paymentId === paymentId);
  if (!row || row.receiptType !== 'OTHER' || row.status !== 'CONFIRMED') return null;
  const allocation = row.incomeAllocation;
  const draft = edited ?? {
    ...createExpenseDraft(row, workspace.data!),
    category: row.unitLabel || row.payer
  };
  async function save() {
    if (!row || pending.current) return;
    const result = calculateExpenseAllocation(row.amount, draft, 'income');
    if (result.error) { setError(result.error); return; }
    pending.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await allocateBankingIncome(propertyId, row.id, {
        ...draft,
        saveAsRule: false,
        allocations: result.allocations
      });
      cache.setQueryData(queryKey, saved); setNotice(true);
      void cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
    } catch (failure) { setError(bankingError(failure)); }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return (
    <section
      className={styles.section}
      aria-label={'기타 입금 동별 배분'}
    >
      {allocation ? (
        <IncomeAllocationSummary
          total={row.amount}
          allocations={allocation.allocations}
        />
      ) : (
        <>
          <h3>
            동별 입금 배분
          </h3>
          <p>
            이자 등 공동 입금을 각 동에 나누어 잔고에 반영합니다. 외부 부담금 회수에는 동별 배분을 사용하지 않습니다.
          </p>
          <AllocationEditor
            purpose={'income'}
            showDetails={false}
            total={row.amount}
            draft={draft}
            buildings={workspace.data!.buildings}
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
              loading={busy}
              onClick={() => { void save(); }}
            >
              입금 배분 확정
            </Button>
          </div>
        </>
      )}
      {notice && (
        <Toast
          message={'동별 입금 배분을 저장했어요.'}
          onClose={() => setNotice(false)}
        />
      )}
    </section>
  );
}
