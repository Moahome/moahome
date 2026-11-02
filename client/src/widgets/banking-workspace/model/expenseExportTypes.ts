import type { DateRange } from '@/shared/lib/date-range';

export interface ExpenseExportContext {
  month?: string;
  period?: DateRange;
  buildingLabel: string;
  search: string;
}
