import type { MonthRange } from '@/shared/lib/month-range';
import type {
  MonthlyCollectionFilters,
  PreviewLedger
} from './paymentPreviewTypes';

export interface MonthlyReportSnapshot {
  propertyId: string;
  propertyName: string;
  month: string;
  range?: MonthRange;
  generatedAt: string;
  ledger: PreviewLedger;
  filters: MonthlyCollectionFilters;
  /** 월·세대 행 선택이며 빈 배열은 미선택입니다. 이전 단일 월 보고서의 세대 선택보다 우선합니다. */
  selectedRowKeys?: readonly string[];
  /** 생략은 전체 조회 범위, 빈 배열은 미선택입니다. 빈 선택을 전체 출력으로 대체하지 않습니다. */
  selectedUnitIds?: readonly string[];
}

export interface MonthlyReportMetric {
  label: string;
  value: string | bigint;
  tone: 'primary' | 'teal' | 'success' | 'danger';
}
