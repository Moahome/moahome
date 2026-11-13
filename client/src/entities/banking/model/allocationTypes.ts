export type BankingAllocation = {
  buildingId: string | null;
  label: string;
  amount: string;
  percentage: string | null;
};

export interface ExpenseAllocationResult {
  allocations: BankingAllocation[];
  allocated: bigint;
  remaining: bigint;
  canFillRatioRemainder: boolean;
  allocationError: string;
  error: string;
}

export interface ExpenseAccountOption {
  code: string;
  name: string;
}

export interface ExpenseAccountSelection {
  accountCode?: string | null;
  accountName?: string | null;
}

export type ExpenseDraft = ExpenseAccountSelection & {
  category: string;
  note: string;
  mode: 'EQUAL' | 'RATIO' | 'AMOUNT' | 'PROPERTY';
  saveAsRule: boolean;
  allocations: BankingAllocation[];
};
