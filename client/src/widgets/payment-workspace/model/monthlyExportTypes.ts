import type {
  MonthlyCollectionFilters,
  PreviewLedger
} from './paymentPreviewTypes';

export interface MonthlyReportSnapshot {
  propertyId: string;
  propertyName: string;
  month: string;
  generatedAt: string;
  ledger: PreviewLedger;
  filters: MonthlyCollectionFilters;
}

export interface MonthlyReportMetric {
  label: string;
  value: string | bigint;
  tone: 'primary' | 'teal' | 'success' | 'danger';
}
