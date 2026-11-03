import type { ExpenseDraft } from './allocationTypes';

export interface ManualReceiptValues {
  accountId: string;
  purpose: 'HOUSEHOLD' | 'OTHER' | 'SHARED';
  date: string;
  amount: string;
  payer: string;
  unitId?: string;
  category?: string;
  note?: string;
  incomeAllocation?: ExpenseDraft;
}

export interface ManualReceiptUnit {
  id: string;
  label: string;
  representativeName?: string | null;
  recentPayerName?: string;
  residentNames?: string[];
}
