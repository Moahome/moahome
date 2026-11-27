'use client';

import type {
  RefObject,
  Dispatch,
  SetStateAction
} from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';
import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';
import { useSession } from '@/entities/session';
import {
  bankingError,
  deleteBankingTransactions
} from '../../../api/bankingApi';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
interface UseBankingSelectionOptions {
  busyRef: RefObject<boolean>;
  visible: BankingTransaction[];
  canDelete: (row: BankingTransaction) => boolean;
  setSelection: Dispatch<SetStateAction<{
    scope: string;
    ids: string[];
  } | null>>;
  selectionScope: string;
  deletingRows: BankingTransaction[];
  linkedDeletionIds: (ids: string[]) => string[];
  setBusy: Dispatch<SetStateAction<boolean>>;
  setDeleteError: Dispatch<SetStateAction<string>>;
  cache: QueryClient;
  propertyId: string;
  receiptIds: Set<string>;
  queryKey: (string | undefined)[];
  propertyScope: ReturnType<typeof capturePropertyQueryScope>;
  session: ReturnType<typeof useSession>;
  setDeleteOpen: Dispatch<SetStateAction<boolean>>;
  setPage: Dispatch<SetStateAction<number>>;
  notify: (message: string, tone?: 'success' | 'error') => void;
}

/** 통장 Selection 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingSelection({
  busyRef,
  visible,
  canDelete,
  setSelection,
  selectionScope,
  deletingRows,
  linkedDeletionIds,
  setBusy,
  setDeleteError,
  cache,
  propertyId,
  receiptIds,
  queryKey,
  propertyScope,
  session,
  setDeleteOpen,
  setPage,
  notify
}: UseBankingSelectionOptions) {

  const toggleDeletion = useCallback((id: string) => {
    if (busyRef.current || !visible.some((row) => row.id === id && canDelete(row)))
      return;
    setSelection({
      scope: selectionScope,
      ids: deletingRows.some((row) => row.id === id)
        ? deletingRows.filter((row) => !linkedDeletionIds([id]).includes(row.id)).map((row) => row.id)
        : linkedDeletionIds([...deletingRows.map((row) => row.id), id])
    });
  }, [busyRef, visible, canDelete, setSelection, selectionScope, deletingRows, linkedDeletionIds]);

  const removeSelected = useCallback(async () => {
    if (busyRef.current || !deletingRows.length)
      return;
    busyRef.current = true;
    setBusy(true);
    setDeleteError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await deleteBankingTransactions(propertyId,
        deletingRows.filter((row) => !receiptIds.has(row.id) && row.sourceType !== 'MANUAL').map((row) => row.id),
        deletingRows.filter((row) => receiptIds.has(row.id)).map((row) => row.paymentId!),
        deletingRows.filter((row) => row.sourceType === 'MANUAL' && row.direction === 'EXPENSE').map((row) => row.id));
      setPropertyQueryData(cache, queryKey, saved, propertyScope);
      // 연결 원본 삭제로 수동 지출에 복귀한 결과와 상세 경로를 원장·미지급 조회에도 반영합니다.
      await Promise.all(['payment-workspace', 'banking-balances', 'billing', 'income-statement', 'monthly-settlement', 'dashboard', 'account-ledger', 'payables'].map((key) => cache.invalidateQueries({
        queryKey: [key, session.data?.id, propertyId]
      })));
      setDeleteOpen(false);
      setSelection(null);
      setPage(1);
      notify('선택한 거래를 삭제했어요.', 'success');
    } catch (error) {
      setDeleteError(bankingError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [busyRef, deletingRows, setBusy, setDeleteError, cache, propertyId, receiptIds, queryKey, propertyScope, session, setDeleteOpen, setSelection, setPage, notify]);

  return {
    toggleDeletion,
    removeSelected
  };
}
