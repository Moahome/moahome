import {
  expect,
  test
} from '@playwright/test';
import { readDashboard } from '../src/screens/management-dashboard/api/dashboardApi';
import {
  getDashboardReport,
  getChartRatio
} from '../src/screens/management-dashboard/model/dashboard';
import { getSettlementReport } from '../src/screens/monthly-settlement/model/monthlySettlement';
import {
  getMonthlyChargeSummary,
  getMonthlyPreviewRows
} from '../src/widgets/payment-workspace';
import {
  dashboardFixture,
  emptyDashboardFixture
} from './support/dashboard';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';

test('대시보드는 기존 수납의 이월·실제 입금과 동 부담 지출을 구분하고 연결·취소 수동 입금을 중복 표시하지 않음', () => {
  const data = dashboardFixture();
  const before = JSON.stringify(data);
  const report = getDashboardReport(readDashboard(data, SETTLEMENT_PROPERTY, '2026-10'));
  expect(report.billed).toBe(BigInt(50000));
  expect(report.applied).toBe(BigInt(10000));
  expect(report.receivable).toBe(BigInt(40000));
  expect(report.expense).toBe(BigInt(12000));
  expect(report.recent).toHaveLength(5);
  expect(report.recent[0].source).toBe('수동 입금');
  expect(report.recent.some((row) => row.id === `receipt:${settlementId(73)}` || row.id === `receipt:${settlementId(74)}`)).toBe(false);
  expect(report.targetCount).toBe(1);
  expect(report.states.find((state) => state.label === '일부납부')?.count).toBe(1);
  expect(report.completeRate).toBe(0);
  expect(JSON.stringify(data)).toBe(before);
});

test('선입금만 보유한 미부과 세대는 도넛 분모에서 구분하고 음수 청구는 정산 확인 상태를 유지', () => {
  const data = dashboardFixture();
  const unitId = settlementId(200);
  data.payments.units.push({
    id: unitId,
    label: '102동 202호',
    status: 'ACTIVE'
  });
  data.payments.openingCredits = [{
    id: settlementId(201),
    unitId,
    date: '2026-09-30',
    amount: '5000',
    allocations: []
  }];
  const prepaid = getDashboardReport(data);
  expect(prepaid.prepaidCount).toBe(1);
  expect(prepaid.prepaidOnlyCount).toBe(1);
  expect(prepaid.targetCount).toBe(1);
  expect(prepaid.applied).toBe(BigInt(10000));
  data.payments.charges.push({
    id: settlementId(202),
    unitId: settlementId(4),
    month: '2026-10',
    status: 'ISSUED',
    amount: '-1000'
  });
  const pending = getDashboardReport(data);
  expect(pending.billed).toBe(BigInt(49000));
  expect(pending.receivable).toBeNull();
  expect(pending.completeRate).toBeNull();
  expect(pending.states[3].count).toBe(1);
});

test('미확인·선택월 이후 확인값은 0원이나 합계로 대체하지 않음', () => {
  const data = dashboardFixture();
  expect(getDashboardReport(data).referenceTotal).toBe(BigInt(120000));
  data.balances.accounts![0].calculatedBalance = null;
  data.balances.accounts![0].confirmation!.date = '2026-11-01';
  expect(getDashboardReport(data).accounts[0].balance).toBeNull();
  expect(getDashboardReport(data).referenceTotal).toBeNull();
});

test('6개월 추이는 연도를 넘어 같은 원장에서 계산하고 큰 정수 좌표와 실제 0원을 구분', () => {
  const data = emptyDashboardFixture(SETTLEMENT_PROPERTY, '2026-02');
  const report = getDashboardReport(data);
  expect(report.trend.map((row) => row.month)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  expect(report.trend.at(-1)?.applied).toBe(report.applied);
  expect(report.completeRate).toBeNull();
  expect(report.referenceTotal).toBeNull();
  expect(getChartRatio(BigInt('999999999999999999999'), BigInt('999999999999999999999'))).toBe(1);
  expect(getChartRatio(BigInt(-1), BigInt(2))).toBe(0.5);
});

test('다른 대상·월·날짜·잘못된 건수·원천 형식은 정상적인 빈 월로 대체하지 않음', () => {
  for (const mutate of [
    (data: ReturnType<typeof dashboardFixture>) => { data.propertyId = settlementId(999); },
    (data: ReturnType<typeof dashboardFixture>) => { data.month = '2026-09'; },
    (data: ReturnType<typeof dashboardFixture>) => { data.businessDate = '2026-02-30'; },
    (data: ReturnType<typeof dashboardFixture>) => { data.tasks.income = -1; },
    (data: ReturnType<typeof dashboardFixture>) => { data.tasks.income = 1.5; },
    (data: ReturnType<typeof dashboardFixture>) => { data.payments.payments[0].amount = 'invalid'; },
    (data: ReturnType<typeof dashboardFixture>) => { data.banking.rows[0].date = '2026-09-01'; }
  ]) {
    const data = dashboardFixture();
    mutate(data);
    expect(() => readDashboard(data, SETTLEMENT_PROPERTY, '2026-10')).toThrow();
  }
});

test('전월 선납은 당월 납부로 충당되어 100만원 청구·5만원 납부·95만원 당월 미수로 표시하고 다른 세대 과거 미납을 섞지 않음', () => {
  const data = emptyDashboardFixture(SETTLEMENT_PROPERTY, '2026-11');
  data.businessDate = data.payments.asOf = data.banking.asOf = '2026-11-01';
  data.payments.accounts = [{
    id: settlementId(2),
    label: '관리 통장'
  }];
  for (let index = 0; index < 20; index++) {
    const unitId = settlementId(500 + index);
    data.payments.units.push({
      id: unitId,
      label: `${index + 1}호`,
      status: 'ACTIVE'
    });
    data.payments.charges.push(
      {
        id: settlementId(600 + index),
        unitId,
        month: '2026-10',
        amount: '200000',
        status: 'ISSUED'
      },
      {
        id: settlementId(700 + index),
        unitId,
        month: '2026-11',
        amount: '50000',
        status: 'ISSUED'
      }
    );
    data.payments.payments.push({
      id: settlementId(800 + index),
      unitId,
      accountId: settlementId(2),
      source: 'MANUAL',
      status: 'CONFIRMED',
      date: '2026-10-31',
      payer: '주민',
      amount: index === 0 ? '300000' : index === 1 ? '150000' : '200000',
      reason: '',
      allocations: []
    });
  }
  const report = getDashboardReport(data);
  expect(report.billed).toBe(BigInt(1000000));
  expect(report.applied).toBe(BigInt(50000));
  expect(report.receivable).toBe(BigInt(950000));
  expect(report.trend.at(-1)?.applied).toBe(report.applied);
  expect(report.prepaidCount).toBe(1);
  expect(report.states[0].count).toBe(1);
  expect(report.states[2].count).toBe(19);
  // 화면마다 누적 미수를 다시 합산하지 않고 동일한 당월 청구 요약을 사용하는지 확인합니다.
  const settlement = getSettlementReport(data);
  const collection = getMonthlyChargeSummary(getMonthlyPreviewRows(data.payments, data.month));
  for (const summary of [settlement, collection]) {
    expect(summary.billed).toBe(report.billed);
    expect(summary.applied).toBe(report.applied);
    expect(summary.receivable).toBe(report.receivable);
  }
});

test('통장 목록은 상세와 같은 장부 우선 계산을 사용하고 0원 장부를 다른 확인 금액으로 바꾸지 않음', () => {
  const data = dashboardFixture();
  const first = data.balances.accounts![0];
  first.balance = '514614';
  first.calculatedBalance = '2037630';
  first.calculationBasisDate = '2026-09-30';
  const second = {
    ...first,
    id: settlementId(992),
    label: '예비비',
    balance: '1523016',
    calculatedBalance: '0'
  };
  data.balances.accounts!.push(second);
  data.banking.accounts!.push({
    ...data.banking.accounts![0],
    id: second.id,
    alias: '예비비',
    isPrimary: false
  });
  const report = getDashboardReport(data);
  expect(report.accounts.map((account) => account.balance)).toEqual(['2037630', '0']);
  expect(report.referenceTotal).toBe(BigInt(2037630));
  expect(report.referenceOnly).toBe(false);
});
