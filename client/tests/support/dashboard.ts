import type { DashboardSnapshot } from '../../src/screens/management-dashboard/api/dashboardApiTypes';
import {
  settlementFixture,
  SETTLEMENT_PROPERTY
} from './monthlySettlement';

/** 업무 계산 회귀는 기존 정산과 같은 원천을 사용하고 대시보드 범위 정보만 덧붙입니다. */
export function dashboardFixture(month = '2026-10'): DashboardSnapshot {
  const data = settlementFixture();
  data.month = month;
  data.balances.month = month;
  data.banking.rows = data.banking.rows.filter((row) => row.date.startsWith(`${month}-`));

  return {
    ...data,
    propertyName: '모아빌라',
    businessDate: '2026-10-31',
    tasks: {
      income: 3,
      expenses: 1,
      joinRequests: 2,
      invitationChanges: 1,
      external: 1,
      duplicates: 0
    }
  };
}

/** 탐색 테스트는 업무가 없는 실제 성공 응답으로 준비 안내 대신 대시보드 진입을 확인합니다. */
export function emptyDashboardFixture(propertyId = SETTLEMENT_PROPERTY, month = '2026-10'): DashboardSnapshot {
  const data = dashboardFixture(month);
  data.propertyId = propertyId;
  data.banking = {
    propertyId,
    asOf: data.businessDate,
    accounts: [],
    buildings: [],
    units: [],
    rows: [],
    rules: []
  };
  data.payments = {
    propertyId,
    asOf: data.businessDate,
    accounts: [],
    units: [],
    charges: [],
    payments: [],
    history: []
  };
  data.balances = {
    propertyId,
    month,
    cutoffDate: null,
    bankBalance: null,
    bankAsOf: null,
    accounts: [],
    buildings: [],
    entries: [],
    externals: [],
    incomes: [],
    pending: []
  };
  data.tasks = {
    income: 0,
    expenses: 0,
    joinRequests: 0,
    invitationChanges: 0,
    external: 0,
    duplicates: 0
  };

  return data;
}
