export interface BankReceiptDraft {
  kind: 'AUTO' | 'HOUSEHOLD' | 'OTHER' | 'SHARED';
  unitId: string;
  category: string;
  note: string;
}
