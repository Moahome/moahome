import type { ExpenseDraft } from '@/entities/banking';
import type {
  CumulativePaymentDraft,
  PreviewPayment
} from '../model/paymentPreviewTypes';

export type PaymentCommand = {
  type: 'manual';
  data: {
    id: string;
    unitId?: string;
    date: string;
    amount: string;
    accountId?: string;
    purpose?: 'HOUSEHOLD' | 'OTHER' | 'SHARED';
    payer?: string;
    category?: string;
    note?: string;
    incomeAllocation?: ExpenseDraft;
  };
} | {
  type: 'confirm';
  id: string;
  data: CumulativePaymentDraft;
} | {
  type: 'other-income';
  id: string;
  data: {
    category: string;
    note?: string;
  };
} | {
  type: 'hold' | 'cancel';
  id: string;
  data: {
    reason: string;
  };
} | {
  type: 'confirm-matches';
} | {
  type: 'delete';
  id: string;
} | {
  type: 'delete-many';
  data: {
    paymentIds: string[];
  };
} | {
  type: 'resume';
  id: string;
} | {
  type: 'link';
  id: string;
  data: {
    paymentId: string;
  };
} | {
  type: 'import';
  file: File;
  transactionIds: string[];
};

export interface PaymentLedgerIdentity {
  propertyId: string;
}

export interface BankFilePreview {
  rows: PreviewPayment[];
  duplicateCount: number;
}

export interface BankFilePreviewResponse {
  propertyId: string;
  rows: PreviewPayment[];
  duplicateCount: number;
}
