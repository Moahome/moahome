import type {
  BankingAllocation,
  ExpenseDraft
} from '@/entities/banking';

export type BankingExpense = ExpenseDraft & {
  id: string;
};

export type BankingTransaction = {
  id: string;
  accountId: string;
  date: string;
  time: string | null;
  payer: string;
  memo: string | null;
  amount: string;
  balance: string | null;
  direction: 'INCOME' | 'EXPENSE';
  ruleKey: string;
  transferCandidate?: boolean;
  transferId?: string | null;
  paymentId: string | null;
  status: string;
  unitId: string;
  unitLabel: string;
  expense: BankingExpense | null;
  incomeAllocation?: BankingExpense | null;
  receiptType?: 'HOUSEHOLD' | 'OTHER' | null;
};

export type BankingAccount = {
  id: string;
  bankName: string;
  last4: string;
  alias: string | null;
  isPrimary: boolean;
  status: string;
};

export type BankingWorkspaceData = {
  accounts?: BankingAccount[];
  propertyId: string;
  asOf: string;
  buildings: {
    id: string;
    label: string;
  }[];
  units: {
    id: string;
    label: string;
  }[];
  rows: BankingTransaction[];
  rules: {
    key: string;
    accountId: string;
    category: string;
    mode: ExpenseDraft['mode'];
    allocations: BankingAllocation[];
  }[];
};

export type BankingPreview = {
  propertyId: string;
  rows: BankingTransaction[];
  duplicateCount: number;
  beforeCutoffCount: number;
};

export type BankingSelection = {
  id: string;
  unitId?: string;
  incomeCategory?: string;
  incomeNote?: string;
  expense?: ExpenseDraft;
  incomeAllocation?: ExpenseDraft;
  transfer?: boolean;
};

export type {
  BankingAllocation,
  ExpenseDraft
} from '@/entities/banking';

export interface BankTransferInput {
  id: string;
  outgoingId: string;
  incomingId: string;
}
