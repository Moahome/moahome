import type { MonthRange } from '@/shared/lib/month-range';

export type LedgerSort = 'latest' | 'oldest';

export type LedgerGroup = 'asset' | 'liability' | 'operatingRevenue' | 'operatingExpense' | 'otherRevenue' | 'otherExpense';

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  group: LedgerGroup;
  systemKey: string | null;
}

export interface LedgerIssue {
  id: string;
  code: string;
  label: string;
  amount: string;
  path: string;
  sourceName: string;
  sourceContext: string;
}

export interface LedgerRow {
  entry: {
    id: string;
    accountId: string;
    accountName: string;
    group: LedgerGroup;
    month: string;
    buildingId: string | null;
    amount: string;
    source: {
      kind: 'CHARGE' | 'BILLING' | 'EXPENSE' | 'OTHER_INCOME' | 'BANK' | 'TRANSFER' | 'RECEIVABLE' | 'RECEIPT' | 'OPENING_CREDIT' | 'EXTERNAL' | 'PAYABLE';
      id: string | null;
      date: string | null;
      time: string | null;
      name: string;
      context: string;
      path: string;
    };
  };
  cashBalance?: { bankAccountId: string; bankAccountName: string; ledgerBalance: string | null; reportedBalance: string | null } | null;
  cumulativeAmount: string;
  sourceIds: string[];
}

export interface AccountLedgerWorkspace {
  propertyId: string;
  propertyName: string;
  generatedAt: string;
  range: MonthRange;
  configuration: { startMonth: string; fiscalYearStartMonth: number } | null;
  completeness: 'SETUP_REQUIRED' | 'NO_BILLING' | 'BEFORE_START' | 'READY' | 'REVIEW_REQUIRED';
  supported: boolean;
  canManage: boolean;
  accountId: string | null;
  accountIds: string[];
  buildingId: string | null;
  buildings: { id: string; name: string; deleted: boolean }[];
  accounts: LedgerAccount[];
  bankAccountId: string | null;
  bankBalances: { accountId: string; name: string; openingBalance: string | null; income: string; expense: string; closingBalance: string | null }[];
  rows: LedgerRow[];
  issues: LedgerIssue[];
  revenue: string;
  expense: string;
}

export interface AccountLedgerQuery {
  propertyId: string;
  startMonth?: string;
  endMonth?: string;
  buildingId?: string;
  accountId?: string;
  accountIds?: string[];
  bankAccountId?: string;
  signal?: AbortSignal;
}
