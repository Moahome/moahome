import type {
  IncomeGroup,
  IncomeStatementSource
} from '../model/incomeStatementTypes';
import type { MonthRange } from '@/shared/lib/month-range';

export interface AccountingIssue {
  id: string;
  code: string;
  label: string;
  sourceName?: string;
  sourceContext?: string;
  amount: string;
  path: string;
  expenseId: string | null;
  revenueItemId: string | null;
}

export interface AccountingExpense {
  id: string;
  transactionId: string;
  date: string;
  name: string;
  amount: string;
  accountId: string | null;
  recognitionMonth: string | null;
  revision: number;
  transferCandidates?: AccountingTransferCandidate[];
  transferPaymentId?: string | null;
}

export interface AccountingTransferCandidate {
  paymentId: string;
  accountName: string;
  name: string;
  date: string;
  amount: string;
}

export interface AccountingRevenueItem {
  id: string;
  name: string;
  amount: string;
  recognized: boolean;
  revision: number;
  sourceContext?: string;
}

export interface AccountingAccount {
  id: string;
  code?: string;
  name: string;
  group: IncomeGroup | 'asset' | 'liability';
  systemKey: string | null;
  active?: boolean;
}

export interface IncomeStatementWorkspace extends IncomeStatementSource {
  propertyId: string;
  propertyName: string;
  generatedAt: string;
  range: MonthRange;
  canManage: boolean;
  completeness: 'NO_BILLING' | 'SETUP_REQUIRED' | 'BEFORE_START' | 'READY' | 'REVIEW_REQUIRED';
  configuration: { startMonth: string; fiscalYearStartMonth: number } | null;
  issues: AccountingIssue[];
  expenses: AccountingExpense[];
  revenueItems: AccountingRevenueItem[];
  accounts: AccountingAccount[];
  buildings: { id: string; name: string; deleted?: boolean }[];
  receivables?: AccountingReceivable[];
  otherIncomes?: AccountingOtherIncome[];
  households?: AccountingHouseholdBalance[];
}

export interface AccountingHouseholdBalance {
  unitId: string;
  label: string;
  receivableAccountId: string;
  advanceAccountId: string;
  receivable: string;
  advance: string;
  path: string;
}

export interface AccountingOtherIncome {
  id: string;
  transactionId: string;
  date: string;
  name: string;
  amount: string;
  accountId: string;
}

export interface AccountingReceivable {
  id: string;
  accountCode: string;
  name: string;
  date: string;
  counterparty: string;
  amount: string;
  received: string;
  remaining: string;
  path: string;
}

export interface IncomeStatementQuery {
  propertyId: string;
  startMonth?: string;
  endMonth?: string;
  buildingId?: string;
  signal?: AbortSignal;
}

export interface ConfigureAccountingRequest {
  startMonth: string;
  fiscalYearStartMonth: number;
}

export interface ReviewAccountingExpenseRequest {
  accountId: string;
  recognitionMonth?: string;
  expectedRevision: number;
  reason?: string;
  counterpartPaymentId?: string;
}

export interface ReviewAccountingRevenueRequest {
  recognized: boolean;
  expectedRevision: number;
  reason?: string;
}
