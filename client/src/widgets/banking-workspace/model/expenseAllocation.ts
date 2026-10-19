import type {
  BankingTransaction,
  BankingWorkspaceData,
  ExpenseDraft
} from '../api/bankingApiTypes';

import { sortExpenseLabels } from '@/entities/banking';
export {
  calculateExpenseAllocation,
  sortExpenseLabels
} from '@/entities/banking';

/** 선택한 동의 실제 부담액만 합산해 외부 부담액·은행 출금 원액과 구분합니다. */
export function getExpenseAmount(row: BankingTransaction, buildingIds: readonly string[]): bigint {
  const selected = new Set(buildingIds);
  return row.expense?.allocations.reduce((sum, part) => (
    part.buildingId && selected.has(part.buildingId) ? sum + BigInt(part.amount) : sum
  ), BigInt(0)) ?? BigInt(0);
}

/** 저장한 내용별 설정을 제안하고, 처음 보는 거래는 원본 내용을 지출명으로 채워 현재 관리 동에 나눕니다. */
export function createExpenseDraft(row: BankingTransaction, workspace: BankingWorkspaceData): ExpenseDraft {
  const rule = row.direction === 'EXPENSE' && workspace.rules.find((item) => item.accountId === row.accountId && item.key === row.ruleKey);
  if (rule) return {
    category: rule.category,
    note: '',
    mode: rule.mode,
    saveAsRule: false,
    allocations: sortExpenseLabels(rule.allocations).map((a) => ({
      ...a
    }))
  };
  return {
    category: row.payer.trim().slice(0, 100),
    note: '',
    mode: 'EQUAL',
    saveAsRule: false,
    allocations: sortExpenseLabels(workspace.buildings).map((building) => ({
      buildingId: building.id,
      label: building.label,
      amount: '',
      percentage: ''
    }))
  };
}
