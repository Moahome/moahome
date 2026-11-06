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
  bankName?: string;
  label: string;
  balance: string | null;
  basis: string | null;
}

export type SettlementRecoveryStatus = '회수 필요' | '일부 회수' | '회수 완료' | '정산 제외';

export type SettlementExternal = MonthlySettlementSnapshot['balances']['externals'][number] & {
  recoveryStatus: SettlementRecoveryStatus;
};
