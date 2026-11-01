'use client';

import type { MonthRange } from '@/shared/lib/month-range';
import { CalendarRangePicker } from '@/shared/ui/calendar-range-picker';

/** 월별 집계에서는 연도를 포함한 시작·종료 월을 공통 기간 달력으로 선택합니다. */
export function MonthRangePicker({ value, onChange, referenceMonth, ...props }: {
  value: MonthRange;
  onChange: (value: MonthRange) => void;
  referenceMonth?: string;
  label?: string;
  labelHidden?: boolean;
  disabled?: boolean;
}) {
  return (
    <CalendarRangePicker
      {...props}
      mode={'month'}
      value={{
        start: value.startMonth,
        end: value.endMonth
      }}
      referenceDate={referenceMonth ? `${referenceMonth}-01` : undefined}
      onChange={(period) => onChange({
        startMonth: period.start,
        endMonth: period.end
      })}
    />
  );
}
