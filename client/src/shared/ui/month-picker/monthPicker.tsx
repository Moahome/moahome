'use client';

import { CalendarPicker } from '@/shared/ui/calendar-picker';

/** 기존 월 선택 진입점을 유지하면서 날짜 선택과 동일한 공통 달력을 사용합니다. */
export function MonthPicker(props: {
  label: string;
  value: string;
  onChange: (month: string) => void;
  clearable?: boolean;
  labelHidden?: boolean;
}) {
  return (
    <CalendarPicker
      {...props}
      mode={'month'}
    />
  );
}
