import type { ExpenseDraft } from '@/entities/banking';

/** 서버에서 읽은 수납 원장과 확정 전 배분 미리보기의 공통 자료형입니다. 저장은 서버 API에서 처리합니다. */
export interface PreviewCharge {
  id: string;
  unitId: string;
  month: string;
  amount: string;
  status: 'ISSUED' | 'CANCELED' | 'EXCLUDED_VACANT';
  chargeType?: 'MONTHLY' | 'OPENING_RECEIVABLE';
}

export interface PreviewAllocation {
  chargeId: string;
  amount: string;
}

export interface PreviewPayment {
  id: string;
  source: 'MANUAL' | 'BANK_IMPORT';
  status: 'PENDING' | 'ON_HOLD' | 'CONFIRMED' | 'CANCELED' | 'LINKED';
  accountId: string;
  date: string;
  payer: string;
  amount: string;
  unitId: string;
  reason: string;
  allocations: PreviewAllocation[];
  linkedPaymentId?: string | null;
  bankTransactionId?: string | null;
  holdReason?: string | null;
  cancelReason?: string | null;
  separateReason?: string | null;
  memo?: string | null;
  receiptType?: 'HOUSEHOLD' | 'OTHER';
  incomeCategory?: string | null;
  incomeNote?: string | null;
  incomeAllocation?: (ExpenseDraft & {
    id: string;
  }) | null;
}

export interface MonthlyPreviewRow {
  unitId: string;
  unitLabel: string;
  buildingName: string;
  representativeName: string;
  latestPayer: string;
  carry: bigint;
  billed: bigint;
  applied: bigint;
  balance: bigint;
  latestDate: string;
  status: '미납' | '일부납부' | '납부완료' | '정산 확인 필요';
  prepaid: bigint;
  settlementAmount: bigint | null;
  settlementPending: boolean;
}

export interface MonthlyCollectionFilters {
  query: string;
  building: string;
  status: string;
}

export interface PreviewLedger {
  asOf: string;
  buildings?: {
    id: string;
    label: string;
  }[];
  accounts: {
    id: string;
    label: string;
    isPrimary?: boolean;
    status?: string;
  }[];
  units: {
    id: string;
    label: string;
    status: 'ACTIVE' | 'VACANT';
    eligible?: boolean;
    representativeId?: string | null;
    representativeName?: string | null;
    residentNames?: string[];
    buildingName?: string;
  }[];
  charges: PreviewCharge[];
  payments: PreviewPayment[];
  history: {
    paymentId: string;
    action: string;
    reason: string;
  }[];
  openingCredits?: {
    id: string;
    unitId: string;
    date: string;
    amount: string;
    allocations: PreviewAllocation[];
  }[];
}

export interface PreviewDraft {
  unitId: string;
  allocations: PreviewAllocation[];
  separateReason?: string;
}

export type CumulativePaymentDraft = Pick<PreviewDraft, 'unitId' | 'separateReason'>;
