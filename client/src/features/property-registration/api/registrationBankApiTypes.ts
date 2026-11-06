export interface RegistrationBankImportRequest {
  accountIndex: number;
  fileName: string;
  content: string;
  rows: {
    id: string;
    unitIndex?: number;
    incomeCategory?: string;
    incomeNote?: string;
    transfer: boolean;
    transferAccountIndex?: number;
    transferAllocations?: { buildingClientId: string; amount: string }[];
    expense?: RegistrationBankDistribution;
    incomeAllocation?: RegistrationBankDistribution;
  }[];
}

export interface RegistrationBankDistribution {
  accountCode?: string;
  category: string;
  note: string | null;
  mode: 'EQUAL' | 'RATIO' | 'AMOUNT' | 'PROPERTY';
  saveAsRule: boolean;
  allocations: {
    buildingClientId: string | null;
    label: string;
    amount: string;
    percentage: string | null;
  }[];
}

export interface RegistrationManualTransactionRequest {
  id: string;
  accountIndex: number;
  direction: 'INCOME' | 'EXPENSE';
  date: string;
  amount: string;
  payer: string;
  purpose: 'HOUSEHOLD' | 'OTHER' | 'SHARED';
  unitIndex?: number;
  category?: string;
  note?: string;
  allocation?: RegistrationBankDistribution;
}
