import type {
  IncomeGroup,
  IncomeStatementSource
} from '../model/incomeStatementTypes';
import type { MonthRange } from '@/shared/lib/month-range';

export interface AccountingIssue {
  id: string;
  code: string;
  label: string;
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
}

export interface AccountingRevenueItem {
  id: string;
  name: string;
  amount: string;
  recognized: boolean;
  revision: number;
}

export interface AccountingAccount {
  id: string;
  name: string;
  group: IncomeGroup;
  systemKey: string | null;
}

export interface IncomeStatementWorkspace extends IncomeStatementSource {
  propertyId: string;
  propertyName: string;
  generatedAt: string;
  range: MonthRange;
  canManage: boolean;
  completeness: 'SETUP_REQUIRED' | 'BEFORE_START' | 'READY' | 'REVIEW_REQUIRED';
  configuration: { startMonth: string; fiscalYearStartMonth: number } | null;
  issues: AccountingIssue[];
  expenses: AccountingExpense[];
  revenueItems: AccountingRevenueItem[];
  accounts: AccountingAccount[];
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

export interface CreateAccountingAccountRequest {
  name: string;
  group: 'OPERATING_EXPENSE' | 'OTHER_EXPENSE';
}

export interface CreateAccountingAccountResponse {
  id: string;
}

export interface ReviewAccountingExpenseRequest {
  accountId: string;
  recognitionMonth: string;
  expectedRevision: number;
  reason: string;
}

export interface ReviewAccountingRevenueRequest {
  recognized: boolean;
  expectedRevision: number;
  reason: string;
}
