import type { ExpenseDraft } from './allocationTypes';

export type ManualExpenseValues = Omit<ExpenseDraft, 'saveAsRule'> & {
  accountId: string;
  date: string;
  amount: string;
};
