'use client';

import {
  useRef,
  useState
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';
import { useSession } from '@/entities/session';
import {
  bankingError,
  linkManualBankingExpense
} from '../../api/bankingApi';
import type { BankingTransaction } from '../../api/bankingApiTypes';

/** 연결 중 중복 실행을 막고 응답 유실 시 선택을 유지해 같은 원본·지출로 재시도합니다. */
export function useManualExpenseLink(propertyId: string, row: BankingTransaction, onBusyChange: (busy: boolean) => void, onLinked: () => void) {
  const session = useSession();
  const cache = useQueryClient();
  const scope = capturePropertyQueryScope(session.data?.id, propertyId);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);

  /** 같은 은행·지출 쌍을 전송하고 최신 업무 조회를 갱신하며 실패 시 선택을 유지합니다. */
  async function connect() {
    if (!selectedId || busy.current)
      return;

    busy.current = true;
    onBusyChange(true);
    setError('');
    const queryKey = ['banking-workspace', session.data?.id, propertyId];
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await linkManualBankingExpense(propertyId,
        row.sourceType === 'MANUAL' ? selectedId : row.id,
        row.sourceType === 'MANUAL' ? row.expense!.id : selectedId);
      setPropertyQueryData(cache, queryKey, saved, scope);
      for (const key of ['banking-balances', 'monthly-settlement', 'dashboard', 'income-statement', 'account-ledger', 'payables']) {
        void cache.invalidateQueries({
          queryKey: [key, session.data?.id, propertyId]
        });
      }
      onLinked();
    } catch (failure) {
      setError(bankingError(failure));
    } finally {
      busy.current = false;
      onBusyChange(false);
    }
  }

  return {
    selectedId,
    setSelectedId,
    error,
    connect
  };
}
