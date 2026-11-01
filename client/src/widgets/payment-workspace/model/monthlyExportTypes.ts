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
  /** 생략은 전체 조회 범위, 빈 배열은 미선택입니다. 빈 선택을 전체 출력으로 대체하지 않습니다. */
  selectedUnitIds?: readonly string[];
}

export interface MonthlyReportMetric {
  label: string;
  value: string | bigint;
  tone: 'primary' | 'teal' | 'success' | 'danger';
}
