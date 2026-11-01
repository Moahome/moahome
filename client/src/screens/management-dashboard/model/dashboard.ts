import { getMonthDateRange } from '@/shared/lib/date-range';
import { getMonthsInRange } from '@/shared/lib/month-range';
import { getAccountsForMonth } from '@/widgets/banking-workspace';
import {
  getMonthlyChargeSummary,
  getMonthlyPreviewRows,
  getPreviewBilledUnits
} from '@/widgets/payment-workspace';
import type { DashboardSnapshot } from '../api/dashboardApiTypes';

/** 기존 월별 수납 계산을 사용해 이월·선입금·미정 청구를 같은 기준으로 표시합니다. */
export function getDashboardReport(data: DashboardSnapshot) {
  const rows = getMonthlyPreviewRows(data.payments, data.month);
  const billedIds = new Set(getPreviewBilledUnits(data.payments, data.month).map((unit) => unit.id));
  const targets = rows.filter((row) => billedIds.has(row.unitId));
  const states = [
    {
      label: '납부완료',
      tone: 'success',
      count: targets.filter((row) => row.status === '납부완료').length
    },
    {
      label: '일부납부',
      tone: 'warning',
      count: targets.filter((row) => row.status === '일부납부').length
    },
    {
      label: '미납',
      tone: 'danger',
      count: targets.filter((row) => row.status === '미납').length
    },
    {
      label: '정산 확인 필요',
      tone: 'neutral',
      count: targets.filter((row) => row.status === '정산 확인 필요').length
    }
  ] as const;
  const chargeSummary = getMonthlyChargeSummary(rows);
  const billed = chargeSummary.billed;
  const receivable = chargeSummary.receivable;
  // 출금 전액과 실제 관리대상 부담액을 구분하고 외부 부담·내부 이체는 운영 지출에 섞지 않습니다.
  const expenses = data.banking.rows.filter((row) => row.direction === 'EXPENSE' && row.status === 'CONFIRMED'
    && !row.transferId && row.expense);
  const expense = expenses.reduce((sum, row) => sum + (row.expense!.allocations.filter((part) => part.buildingId !== null)
    .reduce((total, part) => total + BigInt(part.amount), BigInt(0))), BigInt(0));
  const accounts = getAccountsForMonth(data.banking.accounts ?? [], data.month).map((account) => {
    const balance = data.balances.accounts?.find((row) => row.id === account.id);
    const confirmation = balance?.confirmation;
    const end = getMonthDateRange(data.month).endDate;
    const cutoff = end < data.businessDate ? end : data.businessDate;
    const confirmed = confirmation?.status === 'READY' && confirmation.date <= cutoff;

    return {
      ...account,
      label: account.alias || account.bankName,
      balance: confirmed ? balance?.balance ?? null : null,
      asOf: balance?.asOf ?? null,
      source: confirmation?.source ?? null,
      confirmationDate: confirmation?.date ?? null,
      confirmationTime: confirmation?.time ?? null,
      calculatedBalance: balance?.calculatedBalance ?? null
    };
  });
  const referenceTotal = accounts.length && accounts.every((row) => row.balance !== null)
    ? accounts.reduce((sum, row) => sum + BigInt(row.balance!), BigInt(0)) : null;
  const recent = data.banking.rows.map((row) => ({
    ...row,
    source: row.sourceType === 'MANUAL' ? '수동 지출' : '은행 거래',
    label: row.expense?.category || row.unitLabel || row.payer
  }));
  // 은행과 연결한 수동 입금·취소 이력은 다시 넣지 않으며 실제 목록과 같은 미연결 수동 입금만 추가합니다.
  for (const payment of data.payments.payments) {
    if (payment.source !== 'MANUAL' || payment.bankTransactionId || payment.linkedPaymentId
      || payment.status === 'CANCELED' || payment.status === 'LINKED' || !payment.date.startsWith(`${data.month}-`)
      || payment.date > data.businessDate) continue;
    recent.push({
      id: `receipt:${payment.id}`,
      accountId: payment.accountId,
      date: payment.date,
      time: null,
      payer: payment.payer,
      memo: payment.memo ?? null,
      amount: payment.amount,
      balance: null,
      direction: 'INCOME',
      ruleKey: '',
      paymentId: payment.id,
      status: payment.status,
      unitId: payment.unitId,
      unitLabel: '',
      expense: null,
      source: '수동 입금',
      label: payment.incomeCategory || data.payments.units.find((unit) => unit.id === payment.unitId)?.label || payment.payer
    });
  }
  recent.sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || a.id.localeCompare(b.id));
  const endSerial = Number(data.month.slice(0, 4)) * 12 + Number(data.month.slice(5)) - 1;
  const startSerial = Math.max(12000, endSerial - 5);
  const startMonth = `${Math.floor(startSerial / 12)}-${String(startSerial % 12 + 1).padStart(2, '0')}`;
  const trend = getMonthsInRange({
    startMonth,
    endMonth: data.month
  }).map((month) => {
    const monthly = getMonthlyPreviewRows(data.payments, month);

    const summary = getMonthlyChargeSummary(monthly);

    return {
      month,
      billed: summary.billed,
      applied: summary.applied
    };
  });

  return {
    billed,
    applied: chargeSummary.applied,
    receivable,
    expense,
    expenseCount: expenses.length,
    states,
    targetCount: targets.length,
    completeRate: targets.length && !states[3].count ? Math.round(states[0].count * 1000 / targets.length) / 10 : null,
    prepaidCount: rows.filter((row) => row.prepaid > BigInt(0)).length,
    prepaidOnlyCount: rows.filter((row) => !billedIds.has(row.unitId) && row.prepaid > BigInt(0)).length,
    accounts,
    referenceTotal,
    recent: recent.slice(0, 5),
    trend
  };
}

/** 그래프 좌표만 한정된 비율로 변환하며 원금액의 큰 정수 정밀도는 유지합니다. */
export function getChartRatio(value: bigint, maximum: bigint): number {
  if (maximum === BigInt(0)) return 0;
  const absolute = value < BigInt(0) ? -value : value;

  return Number(absolute * BigInt(10000) / maximum) / 10000;
}
