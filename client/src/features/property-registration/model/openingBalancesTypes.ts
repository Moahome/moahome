export interface UnitOpeningDraft {
  receivable: string;
  credit: string;
}

export interface OpeningBalancesDraft {
  cutoffDate: string;
  firstBillingMonth: string;
  unitMode: '' | 'NONE' | 'ENTER';
  units: Record<string, UnitOpeningDraft>;
  accountAmount: string;
  cashCutoffDate: string;
  buildings: Record<string, string>;
  accountBuildings?: Record<string, Record<string, string>>;
}
