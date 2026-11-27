'use client';

import { NEW_EXPENSE_CHOICE } from '../../../constant/bankingOptions';
import type { BankingWorkspaceData } from '../../../api/bankingApiTypes';
import type {
  Dispatch,
  SetStateAction
} from 'react';

import { useCallback } from 'react';
import type {
  BankingPreview,
  BankingTransaction,
  ExpenseDraft
} from '../../../api/bankingApiTypes';
import { createExpenseDraft } from '../../../model/expenseAllocation';
import type { BankReceiptDraft as ReceiptDraft } from '@/entities/banking';
interface UseBankingRowPresentationOptions {
  expenses: Record<string, ExpenseDraft>;
  manualExpenseLinks: Record<string, string>;
  data: BankingWorkspaceData;
  receipts: Record<string, ReceiptDraft>;
  preview: BankingPreview | null;
  transferRows: string[];
  buildings: {
    id: string;
    label: string;
  }[];
  busy: boolean;
  setReceipts: Dispatch<SetStateAction<Record<string, ReceiptDraft>>>;
  setNotice: Dispatch<SetStateAction<{
    id: number;
    message: string;
    tone: 'success' | 'error';
  } | null>>;
  setExpenses: Dispatch<SetStateAction<Record<string, ExpenseDraft>>>;
}

/** 통장 RowPresentation 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingRowPresentation({
  expenses,
  manualExpenseLinks,
  data,
  receipts,
  preview,
  transferRows,
  buildings,
  busy,
  setReceipts,
  setNotice,
  setExpenses
}: UseBankingRowPresentationOptions) {

  const expenseDraft = useCallback((row: BankingTransaction) => {
    return expenses[row.id] ?? createExpenseDraft(row, data!);
  }, [expenses, data]);

  const receiptDraft = useCallback((row: BankingTransaction): ReceiptDraft => {
    return receipts[row.id] ?? {
      kind: 'AUTO',
      unitId: row.unitId,
      category: '',
      note: ''
    };
  }, [receipts]);

  const processingContent = useCallback((row: BankingTransaction): {
    kind: 'TRANSFER' | 'CANCELED' | 'EXPENSE' | 'SHARED' | 'OTHER' | 'UNCLASSIFIED' | 'HOUSEHOLD';
    title: string;
    detail?: string;
  } => {
    if (row.transferCandidate || (preview && transferRows.includes(row.id)))
      return {
        kind: 'TRANSFER',
        title: row.status === 'CANCELED' ? '취소된 통장간 거래' : '통장간 거래',
        detail: row.sourceType === 'TRANSFER_AUTO' ? '상대 통장 자동 반영' : row.transferId ? '양쪽 통장 반영' : '상대 통장 지정 필요'
      };
    if (row.status === 'CANCELED')
      return {
        kind: 'CANCELED',
        title: '취소된 수납',
        detail: row.unitLabel
      };
    if (row.direction === 'EXPENSE') {
      if (preview && !transferRows.includes(row.id) && manualExpenseLinks[row.id] && manualExpenseLinks[row.id] !== NEW_EXPENSE_CHOICE) {
        return {
          kind: 'EXPENSE',
          title: '기존 지출 연결',
          detail: data.rows.find((item) => item.id === manualExpenseLinks[row.id])?.expense?.category ?? '선택한 수동 지출 확인'
        };
      }
      // 동 없는 대상은 관리대상 전체 부담이므로 존재하지 않는 부담 동의 확인을 요구하지 않습니다.
      if (data.buildings.length === 0)
        return {
          kind: 'EXPENSE',
          title: '지출',
          detail: '관리대상 전체 부담'
        };
      const draft = preview ? expenseDraft(row) : row.expense;
      // 기존 기준대로 외부로 지정한 동도 부담 동 개수에 포함합니다.
      const count = new Set(draft?.allocations.filter((part) => part.label.trim()).map((part) => part.buildingId ?? `external:${part.label.trim()}`)).size;

      return {
        kind: 'EXPENSE',
        title: '지출',
        detail: count ? `${count}동 부담` : '부담 동 확인 필요'
      };
    }

    const draft = preview ? receiptDraft(row) : null;
    const allocation = draft?.kind === 'SHARED' ? expenseDraft(row) : row.incomeAllocation;
    if (allocation)
      return {
        kind: 'SHARED',
        title: '동별 입금',
        detail: allocation.allocations.length ? `${allocation.allocations.length}개 동 배분${preview ? ' 예정' : ''}` : '배분 동 확인 필요'
      };
    if (draft?.kind === 'OTHER' || row.receiptType === 'OTHER')
      return {
        kind: 'OTHER',
        title: '기타 입금',
        detail: !preview && 'source' in row && row.source === 'MANUAL' ? row.unitLabel : undefined
      };

    const unitId = draft?.kind === 'HOUSEHOLD' ? draft.unitId : row.unitId;
    const unitLabel = data?.units.find((unit) => unit.id === unitId)?.label || (!preview && row.unitLabel);
    if (!unitLabel)
      return {
        kind: 'UNCLASSIFIED',
        title: '입금 분류 필요'
      };
    // 미리보기와 미확정 후보를 실제 수납이 완료된 세대로 표시하지 않습니다.
    if (preview)
      return {
        kind: 'HOUSEHOLD',
        title: '세대 수납 예정',
        detail: unitLabel
      };

    return {
      kind: 'HOUSEHOLD',
      title: ['CONFIRMED', 'LINKED'].includes(row.status) ? '세대 수납' : '세대 확인 필요',
      detail: unitLabel
    };
  }, [preview, transferRows, manualExpenseLinks, expenseDraft, receiptDraft, data]);

  const canTransfer = useCallback((row: BankingTransaction) => {
    return Boolean(row.transferId) || (data?.accounts ?? []).filter((account) => account.status === 'ACTIVE').length > 1;
  }, [data]);

  /** 행별 입금·지출 입력을 갱신하며 지출 수정 시 이전 안내를 지웁니다. */
  const changeReceipt = useCallback((id: string, draft: ReceiptDraft) => {
    setReceipts(current => ({
      ...current,
      [id]: draft
    }));
  }, [setReceipts]);

  const changeExpense = useCallback((id: string, draft: ExpenseDraft) => {
    setNotice(null);
    setExpenses(current => ({
      ...current,
      [id]: draft
    }));
  }, [setNotice, setExpenses]);

  return {
    expenseDraft,
    receiptDraft,
    processingContent,
    canTransfer,
    editor: {
      data,
      buildings,
      busy,
      receiptDraft,
      expenseDraft,
      changeReceipt,
      changeExpense
    }
  };
}
