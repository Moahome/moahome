export interface DateRange {
  startDate: string;
  endDate: string;
}

export type DateRangePreset = 'thisMonth' | 'lastMonth' | 'last30Days' | 'last3Months' | 'thisYear';
