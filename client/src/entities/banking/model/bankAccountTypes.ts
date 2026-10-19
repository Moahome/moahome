export interface BankAccountDraft {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  isPrimary: boolean;
  alias?: string;
}

export type BankAccountErrors = Partial<Record<keyof BankAccountDraft, string>>;
