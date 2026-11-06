import { DEFAULT_EXPENSE_ACCOUNTS } from '../constants/expenseAccounts';
import type { ExpenseAccountSelection } from '../model/allocationTypes';

/** 서버가 결정한 최신 과목을 코드와 명칭으로 표시하고 초기 초안의 기본 코드도 같은 이름으로 표시합니다. */
export function getExpenseAccountLabel(expense: ExpenseAccountSelection | null | undefined): string {
  if (!expense?.accountCode) return '미지정';
  const name = expense.accountName ?? DEFAULT_EXPENSE_ACCOUNTS.find((account) => account.code === expense.accountCode)?.name;
  return [expense.accountCode, name].filter(Boolean).join(' ');
}
