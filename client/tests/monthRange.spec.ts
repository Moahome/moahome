import {
  getQueryDateRange,
  getPresetDateRange,
  isDateInRange,
  isValidDateRange
} from '../src/shared/lib/date-range';
import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  formatMonthRange,
  getMonthsInRange,
  getPresetMonthRange,
  getQueryMonthRange,
  getMonthRangeQuery,
  isValidMonthRange
} from '../src/shared/lib/month-range';
import {
  getMonthlyRowKey,
  getMonthlyRangeRows,
  sumMonthlyRangeRows
} from '../src/widgets/payment-workspace/model/monthlyRange';
import {
  createMonthlyWorkbook,
  getMonthlyReportDocument
} from '../src/widgets/payment-workspace/model/monthlyExport';
import { getAccountsForRange } from '../src/widgets/banking-workspace/model/bankAccountVisibility';
import {
  settlementFixture,
  settlementId
} from './support/monthlySettlement';

const range = {
  startMonth: '2026-11',
  endMonth: '2027-03'
};

test('연도를 넘는 월 기간은 양 끝 월을 포함하고 역전·잘못된 월 주소는 적용하지 않는다', () => {
  expect(getMonthsInRange(range)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  expect(formatMonthRange(range)).toBe('2026년 11월 ~ 2027년 3월');
  expect(isValidMonthRange({
    startMonth: '2027-03',
    endMonth: '2026-11'
  })).toBe(false);
  expect(getQueryMonthRange(new URLSearchParams('startMonth=2027-03&endMonth=2026-11&month=2026-12'), '2026-10')).toEqual({
    startMonth: '2026-12',
    endMonth: '2026-12'
  });
  expect(getQueryMonthRange(new URLSearchParams('startMonth=2026-13&endMonth=2027-03'), '2026-10')).toEqual({
    startMonth: '2026-10',
    endMonth: '2026-10'
  });
  expect(getMonthRangeQuery(new URLSearchParams('startMonth=2026-11&endMonth=2027-03&return=https://example.com')).toString()).toBe('startMonth=2026-11&endMonth=2027-03');
  expect(getPresetMonthRange('last3Months', '2027-01')).toEqual({
    startMonth: '2026-11',
    endMonth: '2027-01'
  });
});

test('종료된 통장도 조회 월 범위와 사용 기간이 겹칠 때만 포함한다', () => {
  const account = {
    id: 'account',
    bankName: '하나은행',
    last4: '1234',
    alias: null,
    isPrimary: false,
    status: 'CLOSED',
    availableFrom: '2026-12-31',
    closedOn: '2027-01-01',
    hasHistory: true
  };
  expect(getAccountsForRange([account], {
    startDate: '2026-11-01',
    endDate: '2027-03-31'
  })).toHaveLength(1);
  expect(getAccountsForRange([account], {
    startDate: '2027-02-01',
    endDate: '2027-03-31'
  })).toHaveLength(0);
});

test('최신 월부터 출력하며 이월·잔액은 중복 합산하지 않고 월별 발생액만 기간 합산한다', async () => {
  const ledger = settlementFixture().payments;
  ledger.asOf = '2027-03-31';
  ledger.payments = [];
  ledger.openingCredits = [];
  ledger.units = [ledger.units[0]];
  ledger.charges = ['2026-10', ...getMonthsInRange(range)].map((month, index) => ({
    id: settlementId(800 + index),
    unitId: ledger.units[0].id,
    month,
    amount: '10000',
    status: 'ISSUED'
  }));
  const before = JSON.stringify(ledger);
  const rows = getMonthlyRangeRows(ledger, range);
  expect(rows.map((row) => row.month)).toEqual(['2027-03', '2027-02', '2027-01', '2026-12', '2026-11']);
  expect(sumMonthlyRangeRows(rows, range, 'carry')).toBe(BigInt(10000));
  expect(sumMonthlyRangeRows(rows, range, 'billed')).toBe(BigInt(50000));
  expect(sumMonthlyRangeRows(rows, range, 'balance')).toBe(BigInt(60000));
  const snapshot = {
    propertyId: 'property',
    propertyName: '모아빌라',
    month: range.endMonth,
    range,
    generatedAt: '2027-03-31T03:00:00Z',
    ledger,
    filters: {
      query: '',
      building: '',
      status: '전체'
    }
  };
  const document = getMonthlyReportDocument(snapshot);
  expect(document.rows.map((row) => row[0])).toEqual(rows.map((row) => row.month));
  expect(document.total).toEqual(['합계', '', '', BigInt(10000), BigInt(50000), BigInt(0), BigInt(60000), '']);
  const workbook = unzipSync(new Uint8Array(await (await createMonthlyWorkbook(snapshot)).arrayBuffer()));
  const contents = Object.values(workbook).map((bytes) => strFromU8(bytes)).join('\n');
  expect(contents).toContain('2026년 11월 ~ 2027년 3월');
  expect(contents.indexOf('2027-03')).toBeLessThan(contents.indexOf('2026-11'));
  const selected = getMonthlyReportDocument({
    ...snapshot,
    selectedRowKeys: [getMonthlyRowKey(rows[2])]
  });
  expect(selected.rows).toHaveLength(1);
  expect(selected.rows[0][0]).toBe('2027-01');
  expect(selected.total).toEqual(['합계', '', '', BigInt(30000), BigInt(10000), BigInt(0), BigInt(40000), '']);
  expect(getMonthlyReportDocument({
    ...snapshot,
    selectedRowKeys: []
  }).rows).toHaveLength(0);
  expect(JSON.stringify(ledger)).toBe(before);
});


test('날짜 조회는 월 조회와 별도로 일 단위 경계·윤년·빠른 날짜 범위를 유지한다', () => {
  const days = {
    startDate: '2026-11-02',
    endDate: '2027-03-30'
  };
  expect(isDateInRange('2026-11-01', days)).toBe(false);
  expect(isDateInRange('2026-11-02', days)).toBe(true);
  expect(isDateInRange('2027-03-30', days)).toBe(true);
  expect(isDateInRange('2027-03-31', days)).toBe(false);
  expect(isValidDateRange({
    startDate: '2028-02-29',
    endDate: '2028-03-01'
  })).toBe(true);
  expect(isValidDateRange({
    startDate: '2027-02-29',
    endDate: '2027-03-01'
  })).toBe(false);
  expect(getQueryDateRange(new URLSearchParams('month=2026-11'), '2027-03-31')).toEqual({
    startDate: '2026-11-01',
    endDate: '2026-11-30'
  });
  expect(getPresetDateRange('last3Months', '2027-01-15')).toEqual({
    startDate: '2026-11-01',
    endDate: '2027-01-15'
  });
  expect(getPresetDateRange('thisYear', '2027-03-15')).toEqual({
    startDate: '2027-01-01',
    endDate: '2027-03-15'
  });
});
