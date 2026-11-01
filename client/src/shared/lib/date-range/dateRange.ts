import type {
  DateRange,
  DateRangePreset
} from './dateRangeTypes';

/** 조회 날짜는 한국시간의 달력 날짜로 처리하며 시간대 변환으로 하루가 바뀌지 않게 합니다. */
export function getTodayDate() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).format(new Date());
}

/** 실재하는 날짜만 허용해 잘못된 URL과 종료일보다 늦은 시작일을 조회 조건으로 사용하지 않습니다. */
export function isValidDate(value: string | null): value is string {
  if (!value || !/^[1-9][0-9]{3}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidDateRange(value: DateRange) {
  return isValidDate(value.startDate) && isValidDate(value.endDate) && value.startDate <= value.endDate;
}

/** 기존 월 조회 주소는 해당 월 첫날부터 마지막 날까지의 기간으로 이어받습니다. */
export function getMonthDateRange(month: string): DateRange {
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError('INVALID_MONTH');
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  return {
    startDate: `${month}-01`,
    endDate: last
  };
}

/** 이번 달은 월 전체, 최근 3개월·올해는 기준일까지 조회하며 기존 빠른 선택도 호환합니다. */
export function getPresetDateRange(preset: DateRangePreset, referenceDate = getTodayDate()): DateRange {
  if (preset === 'thisMonth') return getMonthDateRange(referenceDate.slice(0, 7));
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  if (preset === 'thisYear') return {
    startDate: `${referenceDate.slice(0, 4)}-01-01`,
    endDate: referenceDate
  };
  if (preset === 'last3Months') {
    reference.setUTCDate(1);
    reference.setUTCMonth(reference.getUTCMonth() - 2);
    return {
      startDate: reference.toISOString().slice(0, 10),
      endDate: referenceDate
    };
  }
  if (preset === 'lastMonth') {
    reference.setUTCDate(1);
    reference.setUTCMonth(reference.getUTCMonth() - 1);

    return getMonthDateRange(reference.toISOString().slice(0, 7));
  }
  reference.setUTCDate(reference.getUTCDate() - 29);

  return {
    startDate: reference.toISOString().slice(0, 10),
    endDate: referenceDate
  };
}

/** 유효한 기간을 우선하고 이전 month 주소와 잘못된 입력은 조회 기준일의 월로 복원합니다. */
export function getQueryDateRange(params: Pick<URLSearchParams, 'get'>, referenceDate = getTodayDate()): DateRange {
  const range = {
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? ''
  };
  if (isValidDateRange(range)) return range;
  const month = params.get('month');

  return getMonthDateRange(month && /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month) ? month : referenceDate.slice(0, 7));
}

/** 양 끝 날짜를 포함하며 원본 시각과 월별 집계 기준은 변경하지 않습니다. */
export function isDateInRange(date: string, range: DateRange) {
  return date >= range.startDate && date <= range.endDate;
}

export function formatDateRange(range: DateRange) {
  return `${range.startDate.replaceAll('-', '.')} ~ ${range.endDate.replaceAll('-', '.')}`;
}

/** 적용된 기간만 URL에 기록하고 같은 화면에서 month와 기간이 서로 다른 조건을 나타내지 않게 합니다. */
export function setDateRangeQuery(params: URLSearchParams, range: DateRange) {
  params.delete('month');
  params.delete('startMonth');
  params.delete('endMonth');
  params.set('startDate', range.startDate);
  params.set('endDate', range.endDate);
}

/** 상세 진입·복귀에서는 검증한 기간 또는 호환 월만 전달하고 임의의 복귀 주소는 받지 않습니다. */
export function getDateRangeQuery(params: Pick<URLSearchParams, 'get'>, fallbackMonth?: string) {
  const query = new URLSearchParams();
  const range = {
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? ''
  };
  if (isValidDateRange(range)) {
    setDateRangeQuery(query, range);
    return query;
  }
  const month = params.get('month') ?? fallbackMonth;
  if (month && /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month)) query.set('month', month);

  return query;
}
