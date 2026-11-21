'use client';

import type {
  RefObject,
  Dispatch,
  SetStateAction
} from 'react';
import type {
  UseQueryResult,
  QueryClient
} from '@tanstack/react-query';
import type { BankingWorkspaceData } from '../../../api/bankingApiTypes';

import { useCallback } from 'react';
import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';
import {
  calculateTransferAllocation,
  type TransferAllocationPart
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import { useRouter } from 'next/navigation';
import {
  bankingError,
  importBankingFile,
  previewBankingFile
} from '../../../api/bankingApi';
import type {
  BankingPreview,
  BankingSelection,
  BankingTransaction,
  ExpenseDraft
} from '../../../api/bankingApiTypes';
import { calculateExpenseAllocation } from '../../../model/expenseAllocation';
import type { BankReceiptDraft as ReceiptDraft } from '@/entities/banking';
interface UseBankingImportOptions {
  busyRef: RefObject<boolean>;
  accountId: string;
  workspace: UseQueryResult<BankingWorkspaceData, Error>;
  notify: (message: string, tone?: 'success' | 'error') => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  propertyId: string;
  setTransferRows: Dispatch<SetStateAction<string[]>>;
  setTransferAllocations: Dispatch<SetStateAction<Record<string, TransferAllocationPart[]>>>;
  setTransferAccounts: Dispatch<SetStateAction<Record<string, string>>>;
  setFile: Dispatch<SetStateAction<File | null>>;
  setPreview: Dispatch<SetStateAction<BankingPreview | null>>;
  setExcluded: Dispatch<SetStateAction<string[]>>;
  setExpenses: Dispatch<SetStateAction<Record<string, ExpenseDraft>>>;
  setReceipts: Dispatch<SetStateAction<Record<string, ReceiptDraft>>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setReplacingFile: Dispatch<SetStateAction<boolean>>;
  setDirection: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setProcessing: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  file: File | null;
  preview: BankingPreview | null;
  selected: BankingTransaction[];
  canImport: boolean;
  transferRows: string[];
  transferAccounts: Record<string, string>;
  transferAllocations: Record<string, TransferAllocationPart[]>;
  buildings: {
    id: string;
    label: string;
  }[];
  expenseDraft: (row: BankingTransaction) => ExpenseDraft;
  pageSize: number;
  receiptDraft: (row: BankingTransaction) => ReceiptDraft;
  cache: QueryClient;
  activeAccountId: string | undefined;
  queryKey: (string | undefined)[];
  propertyScope: ReturnType<typeof capturePropertyQueryScope>;
  session: ReturnType<typeof useSession>;
  router: ReturnType<typeof useRouter>;
  data: BankingWorkspaceData;
}

/** 통장 Import 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingImport({
  busyRef,
  accountId,
  workspace,
  notify,
  setBusy,
  propertyId,
  setTransferRows,
  setTransferAllocations,
  setTransferAccounts,
  setFile,
  setPreview,
  setExcluded,
  setExpenses,
  setReceipts,
  setEditingId,
  setReplacingFile,
  setDirection,
  setStatus,
  setProcessing,
  setSearch,
  setPage,
  file,
  preview,
  selected,
  canImport,
  transferRows,
  transferAccounts,
  transferAllocations,
  buildings,
  expenseDraft,
  pageSize,
  receiptDraft,
  cache,
  activeAccountId,
  queryKey,
  propertyScope,
  session,
  router,
  data
}: UseBankingImportOptions) {

  const readFile = useCallback(async (next: File) => {
    if (busyRef.current)
      return;
    const selectedAccount = accountId === 'ALL'
      ? workspace.data?.accounts?.find((account) => account.isPrimary && account.status === 'ACTIVE')
      : workspace.data?.accounts?.find((account) => account.id === accountId);
    if (selectedAccount?.status !== 'ACTIVE' || !selectedAccount.importSupport) {
      notify('선택한 통장의 업로드 지원 정보를 확인해주세요.');

      return;
    }
    const usesCommonTemplate = !selectedAccount.importSupport.enabled;
    const extensions = usesCommonTemplate ? ['.xlsx'] : selectedAccount.importSupport.extensions;
    if (!extensions.some((extension) => next.name.toLowerCase().endsWith(extension))) {
      notify(usesCommonTemplate ? '공통 양식은 .xlsx 파일로 업로드해주세요.' : selectedAccount.importSupport!.message);

      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await previewBankingFile(propertyId, next, selectedAccount.id);
      if (result.rows.some((row) => row.accountId !== selectedAccount.id))
        throw new Error('계좌가 일치하지 않습니다.');
      setTransferRows(result.rows.filter((row) => row.transferCandidate).map((row) => row.id));
      setTransferAllocations(Object.fromEntries(result.rows.map((row) => [row.id, row.transferAllocations ?? []])));
      setTransferAccounts(Object.fromEntries(result.rows.filter((row) => row.transferAccountId).map((row) => [row.id, row.transferAccountId!])));
      setFile(next);
      setPreview(result);
      setExcluded([]);
      setExpenses({});
      setReceipts({});
      setEditingId(null);
      setReplacingFile(false);
      setDirection('ALL');
      setStatus('ALL');
      setProcessing('ALL');
      setSearch('');
      setPage(1);
    } catch (error) {
      notify(bankingError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [busyRef, accountId, workspace, notify, setBusy, propertyId, setTransferRows, setTransferAllocations, setTransferAccounts, setFile, setPreview, setExcluded, setExpenses, setReceipts, setEditingId, setReplacingFile, setDirection, setStatus, setProcessing, setSearch, setPage]);

  const resetUpload = useCallback(() => {
    setReplacingFile(false);
    setProcessing('ALL');
    setTransferRows([]);
    setTransferAccounts({});
    setTransferAllocations({});
    setPreview(null);
    setFile(null);
    setExcluded([]);
    setExpenses({});
    setReceipts({});
    setEditingId(null);
    setPage(1);
    setDirection('ALL');
  }, [setReplacingFile, setProcessing, setTransferRows, setTransferAccounts, setTransferAllocations, setPreview, setFile, setExcluded, setExpenses, setReceipts, setEditingId, setPage, setDirection]);

  const commit = useCallback(async () => {
    if (!file || !preview || !selected.length || busyRef.current || !canImport)
      return;
    const rows: BankingSelection[] = [];
    for (const row of selected) {
      if (transferRows.includes(row.id)) {
        if (!transferAccounts[row.id]) {
          setEditingId(row.id);
          notify('이체한 상대 관리 통장을 선택해주세요.');

          return;
        }
        const allocation = calculateTransferAllocation(row.amount, transferAllocations[row.id] ?? [], buildings.length > 0);
        if (allocation.error) {
          setEditingId(row.id);
          notify(allocation.error);

          return;
        }
        rows.push({
          id: row.id,
          transfer: true,
          ...(allocation.allocations.length ? {
            transferAllocations: allocation.allocations
          } : {}),
          transferAccountId: transferAccounts[row.id],
          ...(row.transferId ? {
            matchTransferId: row.transferId
          } : {})
        });
        continue;
      }
      if (row.direction === 'EXPENSE') {
        const draft = expenseDraft(row);
        const result = calculateExpenseAllocation(row.amount, draft);
        if (result.error) {
          setProcessing('ALL');
          setDirection('EXPENSE');
          setSearch('');
          setStatus('ALL');
          setPage(Math.floor(preview.rows.filter((r) => r.direction === 'EXPENSE').findIndex((r) => r.id === row.id) / pageSize) + 1);
          setEditingId(row.id);
          notify(`${row.payer}: ${result.error}`);

          return;
        }
        rows.push({
          id: row.id,
          expense: {
            ...draft,
            allocations: result.allocations
          }
        });
        continue;
      }
      const draft = receiptDraft(row);
      if ((draft.kind === 'HOUSEHOLD' && !draft.unitId) || (draft.kind === 'OTHER' && !draft.category.trim())) {
        setProcessing('ALL');
        setDirection('INCOME');
        setEditingId(row.id);
        notify('입금의 세대 또는 기타 입금 항목을 지정해주세요.');

        return;
      }
      if (draft.kind === 'SHARED') {
        const allocation = expenseDraft(row);
        const calculated = calculateExpenseAllocation(row.amount, allocation, 'income');
        if (calculated.error) {
          setProcessing('ALL');
          setDirection('INCOME');
          setEditingId(row.id);
          notify(calculated.error);

          return;
        }
        rows.push({
          id: row.id,
          incomeCategory: allocation.category.trim(),
          incomeNote: allocation.note.trim() || undefined,
          incomeAllocation: {
            ...allocation,
            saveAsRule: false,
            allocations: calculated.allocations
          }
        });
        continue;
      }
      rows.push({
        id: row.id,
        ...(draft.kind === 'HOUSEHOLD' ? {
          unitId: draft.unitId
        } : {}),
        ...(draft.kind === 'OTHER' ? {
          incomeCategory: draft.category.trim(),
          ...(draft.note.trim() ? {
            incomeNote: draft.note.trim()
          } : {})
        } : {})
      });
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await importBankingFile(propertyId, file, rows, preview.rows[0]?.accountId ?? activeAccountId);
      setPropertyQueryData(cache, queryKey, saved, propertyScope);
      void cache.invalidateQueries({
        queryKey: ['payment-workspace', session.data?.id, propertyId]
      });
      void cache.invalidateQueries({
        queryKey: ['billing', session.data?.id, propertyId]
      });
      // 이체는 양쪽 통장의 장부·정산·대시보드에 동시에 반영되므로 기존 조회도 함께 갱신합니다.
      for (const key of ['banking-balances', 'monthly-settlement', 'dashboard', 'income-statement']) {
        void cache.invalidateQueries({
          queryKey: [key, session.data?.id, propertyId]
        });
      }
      const importedMonth = selected[0].date.slice(0, 7);
      resetUpload();
      router.push(`/manage/${propertyId}/banking/transactions?imported=1${importedMonth === data!.asOf.slice(0, 7) ? '' : `&month=${importedMonth}`}`);
    } catch (error) {
      notify(bankingError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [file, preview, selected, busyRef, canImport, transferRows, transferAccounts, setEditingId, notify, transferAllocations, buildings, expenseDraft, setProcessing, setDirection, setSearch, setStatus, setPage, pageSize, receiptDraft, setBusy, cache, propertyId, activeAccountId, queryKey, propertyScope, session, resetUpload, router, data]);

  return {
    readFile,
    resetUpload,
    commit
  };
}
