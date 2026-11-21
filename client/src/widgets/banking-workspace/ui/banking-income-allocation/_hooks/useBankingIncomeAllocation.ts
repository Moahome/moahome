'use client';

import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';

import { useSession } from '@/entities/session';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useRef,
  useState
} from 'react';
import {
  allocateBankingIncome,
  bankingError,
  getBankingWorkspace
} from '../../../api/bankingApi';
import type { ExpenseDraft } from '../../../api/bankingApiTypes';
import {
  calculateExpenseAllocation,
  createExpenseDraft
} from '../../../model/expenseAllocation';

/** 확정 기타 입금의 배분 초안·검증·중복 요청 차단과 저장 후 캐시 갱신을 담당합니다. */
export function useBankingIncomeAllocation({
  propertyId,
  paymentId,
  onBusyChange
}: { propertyId: string;
paymentId: string;
onBusyChange?: (busy: boolean) => void }) {
  const session = useSession();
  const propertyScope = capturePropertyQueryScope(session.data?.id, propertyId);
  const cache = useQueryClient();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const workspace = useQuery({
    queryKey,
    queryFn: ({
      signal
    }) => getBankingWorkspace(propertyId, signal),
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
  const allocation = row?.incomeAllocation;
  const draft = row && workspace.data ? edited ?? {
    ...createExpenseDraft(row, workspace.data!),
    category: row.unitLabel || row.payer
  } : null;

  /** 입금 전액의 배분을 검증하고 요청 실패에도 초안과 재시도 입력을 유지합니다. */
  async function save() {
    if (!row || !draft || row.receiptType !== 'OTHER' || row.status !== 'CONFIRMED' || pending.current)
      return;
    const result = calculateExpenseAllocation(row.amount, draft, 'income');
    if (result.error) {
      setError(result.error);

      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await allocateBankingIncome(propertyId, row.id, {
        ...draft,
        saveAsRule: false,
        allocations: result.allocations
      });
      setPropertyQueryData(cache, queryKey, saved, propertyScope);
      setNotice(true);
      void cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
    } catch (failure) {
      setError(bankingError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return {
    row,
    allocation,
    draft,
    buildings: workspace.data?.buildings ?? [],
    busy,
    error,
    notice,
    setEdited,
    save,
    closeNotice: () => setNotice(false)
  };
}
