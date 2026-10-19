export type ImportStatus = 'READY' | 'DUPLICATE' | 'ERROR' | 'SUCCESS' | 'NOT_SELECTED';

export interface ImportRow {
  rowNumber: number;
  building: string;
  unitNumber: string;
  name: string;
  relationType: string | null;
  phoneLast4: string | null;
  status: ImportStatus;
  reason: string;
  representative: boolean;
}

export interface ImportResult {
  importId: string;
  expiresAt: string;
  rows: ImportRow[];
}
