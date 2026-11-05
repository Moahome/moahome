import {
  getMonthsInRange,
  isValidMonthRange
} from '@/shared/lib/month-range';
import type { MonthRange } from '@/shared/lib/month-range';
import type {
  IncomeGroup,
  IncomeStatementReport,
  IncomeStatementRow,
  IncomeStatementSource
} from './incomeStatementTypes';

/** 분류가 지정된 자료만 기간·동으로 집계하며 요약·표·그래프는 같은 원 단위 정수를 사용합니다. */
export function getIncomeStatement(source: IncomeStatementSource, range: MonthRange, buildingId = ''): IncomeStatementReport | null {
  // 제공 범위 밖의 월을 0원으로 채워 자료가 있는 기간처럼 표시하지 않습니다.
  if (!isValidMonthRange(range) || range.startMonth < source.availableRange.startMonth
    || range.endMonth > source.availableRange.endMonth
    || (buildingId && !source.buildings.some((building) => building.id === buildingId))) return null;
  const selected = source.records.filter((record) => record.month >= range.startMonth
    && record.month <= range.endMonth && (!buildingId || record.buildingId === buildingId));
  const sum = (group: IncomeGroup) => selected.filter((record) => record.group === group)
    .reduce((total, record) => total + BigInt(record.amount), BigInt(0));
  const operatingRevenue = sum('operatingRevenue');
  const operatingExpense = sum('operatingExpense');
  const otherRevenue = sum('otherRevenue');
  const otherExpense = sum('otherExpense');
  const revenue = operatingRevenue + otherRevenue;
  const expense = operatingExpense + otherExpense;
  const rows: IncomeStatementRow[] = [];

  /** 과목명은 표시만 담당하고 과목 ID·보고서 분류로 같은 과목의 월별 자료를 합칩니다. */
  function appendAccounts(group: IncomeGroup) {
    const accounts = new Map<string, IncomeStatementRow>();
    for (const record of selected.filter((record) => record.group === group)) {
      const existing = accounts.get(record.accountId);
      const amount = BigInt(record.amount) * (group === 'otherExpense' ? -BigInt(1) : BigInt(1));
      if (existing) existing.amount += amount;
      else accounts.set(record.accountId, {
        id: `${group}:${record.accountId}`,
        label: record.accountName,
        amount,
        kind: 'account'
      });
    }
    // API가 제공한 코드·명칭 표시값을 숫자 오름차순으로 정렬해 거래 입력 순서를 표·다운로드에 노출하지 않습니다.
    rows.push(...[...accounts.values()].sort((left, right) => left.label.localeCompare(right.label, 'ko', {
      numeric: true
    })));
  }

  rows.push({
    id: 'operating-revenue',
    label: 'Ⅰ. 운영수익',
    amount: operatingRevenue,
    kind: 'group'
  });
  appendAccounts('operatingRevenue');
  rows.push({
    id: 'operating-expense',
    label: 'Ⅱ. 운영비용',
    amount: operatingExpense,
    kind: 'group'
  });
  appendAccounts('operatingExpense');
  rows.push({
    id: 'operating-profit',
    label: 'Ⅲ. 운영손익',
    amount: operatingRevenue - operatingExpense,
    kind: 'subtotal'
  });
  rows.push({
    id: 'other-profit',
    label: 'Ⅳ. 영업외손익',
    amount: otherRevenue - otherExpense,
    kind: 'subtotal'
  });
  appendAccounts('otherRevenue');
  appendAccounts('otherExpense');
  rows.push({
    id: 'profit',
    label: '기간 순손익',
    amount: revenue - expense,
    kind: 'total'
  });

  const monthly = getMonthsInRange(range).map((month) => {
    const records = selected.filter((record) => record.month === month);
    const monthTotal = (revenue: boolean) => records.filter((record) => revenue
      ? record.group === 'operatingRevenue' || record.group === 'otherRevenue'
      : record.group === 'operatingExpense' || record.group === 'otherExpense')
      .reduce((total, record) => total + BigInt(record.amount), BigInt(0));
    const revenue = monthTotal(true);
    const expense = monthTotal(false);
    return {
      month,
      revenue,
      expense,
      profit: revenue - expense
    };
  });

  return {
    propertyName: source.propertyName ?? '모아홈',
    isExample: source.isExample ?? false,
    notice: source.notice ?? '',
    // 다운로드에서도 같은 사유의 여러 거래를 원본 이름·날짜·세대로 구분할 수 있게 합니다.
    issues: source.issues?.map((issue) => ({
      label: [issue.sourceName, issue.sourceContext, issue.label].filter(Boolean).join(' · '),
      amount: issue.amount
    })) ?? [],
    range,
    buildingName: source.buildings.find((building) => building.id === buildingId)?.name ?? '전체 동',
    revenue,
    expense,
    profit: revenue - expense,
    rows,
    monthly
  };
}

/** 그래프의 누계는 조회 시작 월부터만 더하며 보고서의 기간 합계는 바꾸지 않습니다. */
export function getIncomeTrend(report: IncomeStatementReport, cumulative: boolean) {
  if (!cumulative) return report.monthly;
  let revenue = BigInt(0);
  let expense = BigInt(0);
  return report.monthly.map((row) => {
    revenue += row.revenue;
    expense += row.expense;
    return {
      month: row.month,
      revenue,
      expense,
      profit: revenue - expense
    };
  });
}

/** 그래프 좌표만 비율로 변환하고 표시·다운로드 금액은 bigint 원값을 유지합니다. */
export function getIncomeChartRatio(value: bigint, maximum: bigint) {
  return maximum === BigInt(0) ? 0 : Number(value * BigInt(1000000) / maximum) / 1000000;
}
