import { formatMonthRange } from '@/shared/lib/month-range';
import {
  getMonthlyRowKey,
  getMonthlyRangeRows,
  sumMonthlyRangeRows
} from './monthlyRange';
import type { ReportDefinition } from '@/shared/lib/excel-report';
import {
  formatReportTimestamp,
  getReportPeriodLabel
} from '@/shared/lib/pdf-report';
import { filterMonthlyPreviewRows } from './paymentPreview';
import type {
  MonthlyReportMetric,
  MonthlyReportSnapshot
} from './monthlyExportTypes';

/** 현재 조회 조건과 선택한 세대만 문서·합계에 포함하며 선택이 없는 편집 상태를 전체 출력으로 바꾸지 않습니다. */
export function getMonthlyReportDocument(data: MonthlyReportSnapshot): ReportDefinition {
  const { ledger, month, filters } = data;
  const range = data.range ?? {
    startMonth: month,
    endMonth: month
  };
  const multipleMonths = range.startMonth !== range.endMonth;
  const unpaid = filters.status === '미납';
  const paid = filters.status === '납부완료';
  const prepaid = filters.status === '선입금';
  const showApplied = !unpaid && !prepaid;
  const showBalance = !paid && !prepaid;
  const selectedRows = data.selectedRowKeys === undefined ? null : new Set(data.selectedRowKeys);
  const selectedUnits = data.selectedUnitIds === undefined ? null : new Set(data.selectedUnitIds);
  const selected = selectedRows ?? selectedUnits;
  const rows = filterMonthlyPreviewRows(getMonthlyRangeRows(ledger, range), filters)
    .filter((row) => selectedRows ? selectedRows.has(getMonthlyRowKey(row)) : selectedUnits === null || selectedUnits.has(row.unitId));
  // 일부 행만 내보낼 때는 선택 내역의 첫 월·마지막 월을 잔액 집계 기준으로 표시합니다.
  const selectedMonths = rows.map((row) => row.month).sort();
  const summaryRange = selectedRows && rows.length ? {
    startMonth: selectedMonths[0],
    endMonth: selectedMonths.at(-1)!
  } : range;
  const selectionLabel = selectedRows ? `선택 ${rows.length}${multipleMonths ? '건' : '세대'}` : `선택 ${new Set(rows.map((row) => row.unitId)).size}세대`;
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance' | 'prepaid') => sumMonthlyRangeRows(rows, summaryRange, key);
  const balance = rows.some((row) => row.month === summaryRange.endMonth && row.settlementPending) ? '정산 확인 필요' : sum('balance');
  const countLabel = `${rows.length}${multipleMonths ? '건 (세대·월)' : '세대'}`;
  const amountStart = multipleMonths ? 3 : 2;

  return {
    title: `${data.propertyName} 월별 수납 현황`,
    description: `세대별 청구·수납 및 미수금 보고서 · ${filters.status}${filters.building ? ` · ${filters.building}` : ''}${filters.query.trim() ? ` · 검색: ${filters.query.trim()}` : ''}${selected === null ? '' : ` · ${selectionLabel}`}`,
    sheet: '월별 수납 현황',
    // 미납은 충당액이 없는 상태이므로 시안처럼 이월·발생·미수만 보여주고 다른 상태에는 수납 반영액을 유지합니다.
    columns: [...(multipleMonths ? ['부과 월'] : []), ...(prepaid
      ? ['세대', '세대 대표', '선입금 잔액', '상태']
      : ['세대', '세대 대표', '전월 이월액', '당월 발생액', ...(showApplied ? ['당월 수납 반영액'] : []), ...(showBalance ? ['미수금 잔액'] : []), '상태'])].map((label, index, labels) => {
      const amount = index >= amountStart && index < labels.length - 1;
      let align: 'left' | 'center' | 'right' = 'center';
      if (index === 0) align = 'left';
      if (amount) align = 'right';
      return {
        label,
        width: amount ? 25 : 22,
        align
      };
    }),
    summary: [...(selected === null ? [] : [{
      label: '출력 범위',
      value: selectionLabel
    }]), {
      label: '조회 월',
      value: formatMonthRange(selectedRows ? summaryRange : range)
    }, {
      label: '집계 기준 월',
      value: formatMonthRange(summaryRange)
    }, {
      label: '조회 동',
      value: filters.building || '전체 동'
    }, {
      label: '납부 상태',
      value: filters.status
    }, {
      label: '검색어',
      value: filters.query.trim() || '전체'
    }, {
      label: '조회시각',
      value: formatReportTimestamp(data.generatedAt)
    }, {
      label: '기간 상태',
      value: multipleMonths ? '각 월의 조회 기준' : getReportPeriodLabel(data)
    }, {
      label: '조회 세대',
      value: countLabel
    }],
    rows: rows.map((row) => [...(multipleMonths ? [row.month] : []), ...(prepaid
      ? [row.unitLabel, row.representativeName, row.prepaid, row.status]
      : [row.unitLabel, row.representativeName, row.carry, row.billed + (row.settlementAmount ?? BigInt(0)), ...(showApplied ? [row.applied] : []), ...(showBalance ? [row.settlementPending ? '정산 확인 필요' : row.balance] : []), row.status])]),
    total: ['합계', ...(multipleMonths ? [''] : []), ...(prepaid ? ['', sum('prepaid'), ''] : ['', sum('carry'), sum('billed'), ...(showApplied ? [sum('applied')] : []), ...(showBalance ? [balance] : []), ''])],
    note: multipleMonths ? `※ 이월은 ${summaryRange.startMonth}, 미수·선입금은 ${summaryRange.endMonth} 기준 잔액입니다. 발생·수납 반영액만 합산하며 선택하지 않은 행은 제외합니다. 금액은 원 단위입니다.` : prepaid ? '※ 선입금 잔액은 당월까지 발생한 관리비를 차감하고 남은 월말 잔액입니다. 기존 인계 선납을 포함하며 당월 실제 입금액과 다릅니다. 금액은 원 단위입니다.' : unpaid
      ? '※ 미수금 잔액은 청구에 충당된 금액을 제외한 실제 미납 금액입니다. 금액은 원 단위입니다.'
      : '※ 당월 수납 반영액은 청구에 충당된 금액이며 통장에 실제 입금된 금액과 다를 수 있습니다. 금액은 원 단위입니다.'
  };
}

/** 보고서에 실제 있는 금액 열만 요약해 Excel·PDF·미리보기의 카드 구성을 함께 유지합니다. */
export function getMonthlyReportMetrics(document: ReportDefinition): MonthlyReportMetric[] {
  return ([
    ['전월 이월액', 'primary'],
    ['당월 발생액', 'teal'],
    ['당월 수납 반영액', 'success'],
    ['미수금 잔액', 'danger'],
    ['선입금 잔액', 'teal'],
  ] as const).flatMap(([label, tone]) => {
    const index = document.columns.findIndex((column) => column.label === label);
    return index < 0 ? [] : [{
      label: document.summary.find((item) => item.label === '조회 월')?.value.toString().includes(' ~ ') ? ({
        '전월 이월액': '시작 월 이월액',
        '당월 발생액': '기간 발생액',
        '당월 수납 반영액': '기간 수납 반영액',
        '미수금 잔액': '종료 월 미수금',
        '선입금 잔액': '종료 월 선입금'
      }[label]) : label,
      tone: typeof document.total?.[index] === 'bigint' && document.total[index] < BigInt(0) ? 'danger' : tone,
      value: document.total?.[index] ?? ''
    }];
  });
}

/** Excel도 미리보기·PDF와 같은 문서 정의를 사용해 선택 조건과 금액이 달라지지 않게 합니다. */
export async function createMonthlyWorkbook(data: MonthlyReportSnapshot): Promise<Blob> {
  const { createMonthlyStyledWorkbook } = await import('./monthlyReportWorkbook');
  return createMonthlyStyledWorkbook(getMonthlyReportDocument(data));
}
