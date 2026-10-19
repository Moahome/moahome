import type { BankAccountDraft } from '@/entities/banking';

export interface RegistrationAccount extends BankAccountDraft {
  clientId: string;
  openingAmount: string;
}

export type {
  BankAccountDraft,
  BankAccountErrors
} from '@/entities/banking';
