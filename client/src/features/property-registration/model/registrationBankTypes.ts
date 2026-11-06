import type {
  BankReceiptDraft,
  TransferAllocationPart,
  ExpenseDraft
} from '@/entities/banking';

export interface RegistrationBankRow {
  id: string;
  date: string;
  time: string | null;
  payer: string;
  memo: string | null;
  amount: string;
  balance: string | null;
  direction: 'INCOME' | 'EXPENSE';
  autoMatchEligible: boolean;
}

export interface RegistrationBankChoice {
  included: boolean;
  transfer: boolean;
  transferAccountId?: string;
  transferAllocations?: TransferAllocationPart[];
  receipt: BankReceiptDraft;
  expense: ExpenseDraft;
}

export interface RegistrationBankDraft {
  fileName: string;
  content: string;
  bankCode: string;
  accountNumber: string;
  rows: RegistrationBankRow[];
  choices: Record<string, RegistrationBankChoice>;
  period: { from: string; to: string };
}

export interface RegistrationManualTransaction {
  id: string;
  accountClientId: string;
  direction: 'INCOME' | 'EXPENSE';
  date: string;
  amount: string;
  payer: string;
  purpose: 'HOUSEHOLD' | 'OTHER' | 'SHARED';
  unitClientId?: string;
  category?: string;
  note?: string;
  allocation?: ExpenseDraft;
}

export interface RegistrationBankSupport {
  enabled: boolean;
  extensions: string[];
  message: string;
}

export interface RegistrationBankPreview {
  rows: RegistrationBankRow[];
  period: { from: string; to: string };
  support: RegistrationBankSupport;
  duplicateCount: number;
}
