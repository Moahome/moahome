import {
  getMonthsInRange,
  type MonthRange
} from '@/shared/lib/month-range';
import {
  getMonthlyPreviewRows,
  getMonthlyChargeReceivable,
  getMonthlyPreviewIncome
} from './paymentPreview';
import type {
  MonthlyPreviewRow,
  PreviewLedger
} from './paymentPreviewTypes';
import type { MonthlyRangeRow } from './monthlyRangeTypes';

/** 최신 월부터 표시하고 각 월의 기존 세대 순서·수납 계산과 상세 조회 기준을 보존합니다. */
export function getMonthlyRangeRows(ledger: PreviewLedger, range: MonthRange): MonthlyRangeRow[] {
  return getMonthsInRange(range).reverse().flatMap((month) => getMonthlyPreviewRows(ledger, month).map((row) => ({
    ...row,
    month
  })));
}

/** 발생·반영액만 기간 합산하고 이월은 시작 월, 미수·선입금은 종료 월의 잔액으로 계산합니다. */
export function sumMonthlyRangeRows(rows: MonthlyRangeRow[], range: MonthRange, key: 'carry' | 'billed' | 'applied' | 'balance' | 'prepaid') {
  return rows.reduce((total, row) => {
    if (key === 'carry' && row.month !== range.startMonth) return total;
    if ((key === 'balance' || key === 'prepaid') && row.month !== range.endMonth) return total;
    return total + row[key] + (key === 'billed' ? row.settlementAmount ?? BigInt(0) : BigInt(0));
  }, BigInt(0));
}

/** 실제 입금은 날짜가 속한 월마다 한 번만 합산하며 청구 충당액과 섞지 않습니다. */
export function getMonthlyRangeIncome(ledger: PreviewLedger, range: MonthRange) {
  return getMonthsInRange(range).map((month) => getMonthlyPreviewIncome(ledger, month)).reduce((total, income) => ({
    household: total.household + income.household,
    other: total.other + income.other,
    total: total.total + income.total,
    otherCount: total.otherCount + income.otherCount
  }), {
    household: BigInt(0),
    other: BigInt(0),
    total: BigInt(0),
    otherCount: 0
  });
}

/** 같은 세대라도 부과 월이 다르면 별개의 조회·선택 행입니다. */
export function getMonthlyRowKey(row: Pick<MonthlyRangeRow, 'month' | 'unitId'>) {
  return `${row.month}:${row.unitId}`;
}

/** 상단의 발생·납부·미수는 같은 신규 청구 집합으로 맞추고 누적 원장의 이월·잔여액은 변경하지 않습니다. */
export function getMonthlyChargeSummary(rows: readonly MonthlyPreviewRow[]) {
  const pending = rows.some((row) => row.settlementPending);
  const billed = rows.reduce((sum, row) => sum + row.billed + (row.settlementAmount ?? BigInt(0)), BigInt(0));
  const receivable = rows.reduce((sum, row) => sum + getMonthlyChargeReceivable(row), BigInt(0));

  return {
    billed,
    applied: pending ? null : billed - receivable,
    receivable: pending ? null : receivable
  };
}
