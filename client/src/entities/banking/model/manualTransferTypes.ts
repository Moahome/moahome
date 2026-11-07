export interface ManualTransferSeed {
  direction: 'INCOME' | 'EXPENSE';
  accountId: string;
  date: string;
  amount: string;
  note?: string;
}
