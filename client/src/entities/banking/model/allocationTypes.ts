export type BankingAllocation = {
  buildingId: string | null;
  label: string;
  amount: string;
  percentage: string | null;
};

export type ExpenseDraft = {
  category: string;
  note: string;
  mode: 'EQUAL' | 'RATIO' | 'AMOUNT' | 'PROPERTY';
  saveAsRule: boolean;
  allocations: BankingAllocation[];
};
