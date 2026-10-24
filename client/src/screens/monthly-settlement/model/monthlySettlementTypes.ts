import type { MonthlySettlementSnapshot } from '../api/monthlySettlementApiTypes';

export interface SettlementCashRow {
  id: string;
  accountId: string;
  date: string;
  label: string;
  amount: bigint;
  direction: 'INCOME' | 'EXPENSE';
  source: string;
  transfer: boolean;
}

export interface SettlementCheck {
  id: string;
  title: string;
  description: string;
  count: number;
  path: string;
}

export interface SettlementAccount {
  id: string;
  label: string;
  confirmed: string | null;
  asOf: string | null;
  source: string;
  calculated: string | null;
  basis: string | null;
  difference: bigint | null;
  comparison: string;
}

export type SettlementRecoveryStatus = '회수 필요' | '일부 회수' | '회수 완료' | '정산 제외';

export type SettlementExternal = MonthlySettlementSnapshot['balances']['externals'][number] & {
  recoveryStatus: SettlementRecoveryStatus;
};
