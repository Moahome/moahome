import type {
  MonthRange,
  MonthRangePreset
} from './monthRangeTypes';

/** 월 단위 조회는 연도를 포함하며 시작·종료 월을 모두 포함합니다. */
export function isValidMonth(value: string | null): value is string {
  return value !== null && /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidMonthRange(value: MonthRange) {
  return isValidMonth(value.startMonth) && isValidMonth(value.endMonth) && value.startMonth <= value.endMonth;
}

/** 시작 월이 늦은 잘못된 주소는 적용하지 않고 기존 단일 월 주소와 호환합니다. */
export function getQueryMonthRange(query: Pick<URLSearchParams, 'get'>, fallbackMonth = getCurrentMonth()): MonthRange {
  const range = {
    startMonth: query.get('startMonth') ?? '',
    endMonth: query.get('endMonth') ?? ''
  };
  if (isValidMonthRange(range)) return range;
  const legacy = query.get('month');
  const month = isValidMonth(legacy) ? legacy : fallbackMonth;
  return {
    startMonth: month,
    endMonth: month
  };
}

export function setMonthRangeQuery(query: URLSearchParams, range: MonthRange) {
  query.delete('month');
  query.set('startMonth', range.startMonth);
  query.set('endMonth', range.endMonth);
  return query;
}

export function formatMonthRange(range: MonthRange) {
  const format = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  return range.startMonth === range.endMonth ? format(range.startMonth) : `${format(range.startMonth)} ~ ${format(range.endMonth)}`;
}

/** 연도 경계를 정수 월로 계산해 11월~다음 해 3월 같은 구간을 빠짐없이 생성합니다. */
export function getMonthsInRange(range: MonthRange): string[] {
  if (!isValidMonthRange(range)) return [];
  const serial = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  return Array.from({
    length: serial(range.endMonth) - serial(range.startMonth) + 1
  }, (_, index) => {
    const value = serial(range.startMonth) + index;
    return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
  });
}

/** 빠른 선택도 같은 월 범위 자료형을 사용하며 현재 월은 한국시간을 따릅니다. */
export function getCurrentMonth() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).format(new Date()).slice(0, 7);
}

export function getPresetMonthRange(preset: MonthRangePreset, referenceMonth: string): MonthRange {
  if (preset === 'thisYear') return {
    startMonth: `${referenceMonth.slice(0, 4)}-01`,
    endMonth: referenceMonth
  };
  if (preset === 'thisMonth') return {
    startMonth: referenceMonth,
    endMonth: referenceMonth
  };
  const value = Number(referenceMonth.slice(0, 4)) * 12 + Number(referenceMonth.slice(5)) - 3;
  return {
    startMonth: `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`,
    endMonth: referenceMonth
  };
}


/** 상세·복귀에는 검증된 월 범위만 전달하고 기존 단일 월 주소도 유지합니다. */
export function getMonthRangeQuery(query: Pick<URLSearchParams, 'get'>, fallbackMonth?: string) {
  const next = new URLSearchParams();
  const range = {
    startMonth: query.get('startMonth') ?? '',
    endMonth: query.get('endMonth') ?? ''
  };
  if (isValidMonthRange(range)) return setMonthRangeQuery(next, range);
  const month = query.get('month') ?? fallbackMonth;
  if (month && isValidMonth(month)) next.set('month', month);
  return next;
}
