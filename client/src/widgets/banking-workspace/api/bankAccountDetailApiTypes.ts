export interface BankAccountDetail {
  propertyId: string;
  accountId: string;
  updatedAt: string;
  bankCode: string;
  bankName: string;
  last4: string;
  holderName: string;
  alias: string | null;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

export interface BankAccountNumberResponse {
  propertyId: string;
  accountId: string;
  updatedAt: string;
  accountNumber: string;
}
