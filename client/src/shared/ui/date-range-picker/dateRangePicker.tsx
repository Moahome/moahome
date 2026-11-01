'use client';

import type { DateRange } from '@/shared/lib/date-range';
import { CalendarRangePicker } from '@/shared/ui/calendar-range-picker';

/** 입출금 조회는 공통 기간 달력의 날짜 모드로 시작일·종료일을 모두 선택합니다. */
export function DateRangePicker({ value, onChange, ...props }: {
  value: DateRange;
  onChange: (value: DateRange) => void;
  referenceDate?: string;
  label?: string;
  labelHidden?: boolean;
  disabled?: boolean;
}) {
  return (
    <CalendarRangePicker
      {...props}
      mode={'date'}
      value={{
        start: value.startDate,
        end: value.endDate
      }}
      onChange={(period) => onChange({
        startDate: period.start,
        endDate: period.end
      })}
    />
  );
}
