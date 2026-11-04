import type { MonthRange } from '@/shared/lib/month-range';

export type IncomeGroup = 'operatingRevenue' | 'operatingExpense' | 'otherRevenue' | 'otherExpense';

export interface IncomeRecord {
  id: string;
  accountId: string;
  accountName: string;
  group: IncomeGroup;
  month: string;
  buildingId: string;
  amount: string;
}

export interface IncomeStatementSource {
  propertyName?: string;
  isExample?: boolean;
  notice?: string;
  issues?: readonly { label: string; amount: string }[];
  availableRange: MonthRange;
  buildings: readonly { id: string; name: string }[];
  records: readonly IncomeRecord[];
}

export interface IncomeStatementRow {
  id: string;
  label: string;
  amount: bigint;
  kind: 'group' | 'account' | 'subtotal' | 'total';
}

export interface IncomeMonth {
  month: string;
  revenue: bigint;
  expense: bigint;
  profit: bigint;
}

export interface IncomeStatementReport {
  propertyName: string;
  isExample: boolean;
  notice: string;
  issues: readonly { label: string; amount: string }[];
  range: MonthRange;
  buildingName: string;
  revenue: bigint;
  expense: bigint;
  profit: bigint;
  rows: IncomeStatementRow[];
  monthly: IncomeMonth[];
}
