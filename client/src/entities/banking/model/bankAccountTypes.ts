export interface BankAccountDraft {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  isPrimary: boolean;
  alias?: string;
}

export type BankAccountErrors = Partial<Record<keyof BankAccountDraft, string>>;

export interface BankAccountLabelSource {
  alias?: string | null;
  bankName?: string;
  last4?: string;
  accountNumber?: string;
  label?: string;
}
