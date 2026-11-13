import type { BankAccountDraft } from '@/entities/banking';

export type BankAccountSettings = Omit<BankAccountDraft, 'isPrimary'> & {
  propertyId: string;
  accountId: string;
  updatedAt: string;
};

export type ManagedBankAccount = Omit<BankAccountSettings, 'alias'> & {
  alias: string | null;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
};
