import {
  expect,
  test
} from '@playwright/test';
import {
  clearSession,
  setSession
} from '../src/entities/session';
import { getAccountLedger } from '../src/screens/accounting/ledger/api/accountLedgerApi';
import { sortLedger } from '../src/screens/accounting/ledger/model/accountLedgerSort';
import { getLedgerDocuments } from '../src/screens/accounting/ledger/model/accountLedgerReport';
import {
  ledgerFixture,
  LEDGER_COST,
  LEDGER_REVENUE,
  LEDGER_PAYABLE,
  LEDGER_BUILDING
} from './support/accountLedger';
import { SETTLEMENT_PROPERTY } from './support/monthlySettlement';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalHost = process.env.NEXT_PUBLIC_API_HOST;

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_API_HOST = 'http://localhost:8080';
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true
  });
  setSession({
    accessToken: 'test-access',
    tokenType: 'Bearer',
    csrfToken: 'test-csrf',
    accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
  });
});

test.afterEach(() => {
  clearSession();
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalHost === undefined) delete process.env.NEXT_PUBLIC_API_HOST;
  else process.env.NEXT_PUBLIC_API_HOST = originalHost;
});

test('인증·조회 조건과 과목별 누계를 검사하고 다운로드는 전체 반영 내역을 보존한다', async () => {
  let authorization = '';
  let requestUrl = '';
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return Response.json(ledgerFixture(new URL(requestUrl).searchParams));
  };
  const result = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    startMonth: '2026-10',
    endMonth: '2026-10',
    accountId: LEDGER_COST,
    buildingId: LEDGER_BUILDING
  });
  expect(authorization).toBe('Bearer test-access');
  expect(requestUrl).toContain(`accountId=${LEDGER_COST}`);
  expect(requestUrl).toContain(`buildingId=${LEDGER_BUILDING}`);
  expect(result.rows).toHaveLength(23);
  expect(result.rows[0].cumulativeAmount).toBe(result.expense);
  expect(result.rows.at(-1)?.cumulativeAmount).toBe('1000');
  const report = getLedgerDocuments(result)[0];
  expect(report.columns.map((column) => column.label)).not.toContain('원본 정보');
  expect(report.rows[0]).not.toContain('부담처 102동');
  expect(report.rows).toHaveLength(23);
  expect(report.rows[0].at(-1)).toBe(BigInt(result.expense));
  expect(report.note).toContain('다른 과목의 기간 누계는 조회 기간 반영액');
});

test('다른 대상·과목·기간·동·누계·합계와 잘못된 원본 연결을 거부한다', async () => {
  for (const mutate of [
    (data: ReturnType<typeof ledgerFixture>) => { data.propertyId = LEDGER_COST; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.accountId = SETTLEMENT_PROPERTY; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.month = '2026-09'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.buildingId = SETTLEMENT_PROPERTY; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.amount = '1e3'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].cumulativeAmount = '0'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.expense = '1'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.source.path = '//example.com'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows[0].entry.source.date = '2026-02-30'; },
    (data: ReturnType<typeof ledgerFixture>) => { data.rows.push(data.rows[0]); }
  ]) {
    const data = ledgerFixture();
    mutate(data);
    globalThis.fetch = async () => Response.json(data);
    await expect(getAccountLedger({
      propertyId: SETTLEMENT_PROPERTY
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
  }
});

test('미지급금 계정을 조회하고 요청 실패를 0원으로 대체하지 않는다', async () => {
  globalThis.fetch = async () => Response.json(ledgerFixture(new URLSearchParams({
    accountId: LEDGER_PAYABLE
  })));
  const result = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountId: LEDGER_PAYABLE
  });
  expect(result.supported).toBe(true);
  expect(result.rows).toHaveLength(0);
  globalThis.fetch = async () => Response.json({
    code: 'ACCOUNTING_SERVICE_UNAVAILABLE',
    message: '조회 실패'
  }, {
    status: 503
  });
  await expect(getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY
  })).rejects.toMatchObject({
    status: 503
  });
});

test('미확인 자료는 별도 시트에 남기고 반영액과 합산하지 않는다', () => {
  const data = ledgerFixture();
  data.issues = [{
    id: 'pending',
    code: 'REVIEW_REQUIRED',
    label: '음수 청구 확인',
    sourceName: '관리비 부과',
    sourceContext: '102동',
    amount: '-20000',
    path: '/billing/monthly?month=2026-10'
  }];
  data.completeness = 'REVIEW_REQUIRED';
  const documents = getLedgerDocuments(data);
  expect(documents).toHaveLength(2);
  expect(documents[1].columns.map((column) => column.label)).not.toContain('원본 정보');
  expect(documents[1].rows[0].at(-1)).toBe(BigInt(-20000));
  expect(documents[0].summary[0].value).toBe(BigInt(data.revenue));
});

test('안전 정수 범위를 넘는 원화 반영액과 누계를 소수점 없이 보존한다', async () => {
  const data = ledgerFixture();
  const amount = '99999999999999999999';
  data.rows = [{
    entry: {
      ...data.rows[0].entry,
      amount
    },
    cumulativeAmount: amount,
    sourceIds: data.rows[0].sourceIds
  }];
  data.revenue = '0';
  data.expense = amount;
  globalThis.fetch = async () => Response.json(data);
  const result = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY
  });
  expect(result.expense).toBe(amount);
  expect(getLedgerDocuments(result)[0].rows[0].at(-1)).toBe(BigInt(amount));
});

test('401은 월초 부과일을 적요·동 뒤에 표시하고 혼합 조회와 지출의 날짜 이름을 구분한다', async () => {
  globalThis.fetch = async (input) => Response.json(ledgerFixture(new URL(String(input)).searchParams));
  const revenue = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountId: LEDGER_REVENUE
  });
  const report = getLedgerDocuments(revenue)[0];
  expect(report.columns.map((column) => column.label)).toEqual(['계정과목', '적요', '동', '귀속 월', '부과일', '반영액', '과목별 기간 누계']);
  expect(report.rows[0][4]).toBe('2026-10-01');
  const expense = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountId: LEDGER_COST
  });
  expect(getLedgerDocuments(expense)[0].columns[4].label).toBe('거래일');
  const all = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY
  });
  expect(getLedgerDocuments(all)[0].columns[4].label).toBe('일자');
});


test('최신순과 오래된순 정렬은 원본·누계·전체 다운로드 금액을 보존한다', () => {
  const data = ledgerFixture();
  const initialIds = data.rows.map((row) => row.entry.id);
  const latest = sortLedger(data, 'latest');
  expect(latest.rows[0].entry.accountId).toBe(LEDGER_REVENUE);
  expect(latest.rows.find((row) => row.entry.accountId === LEDGER_COST)?.entry.source.name).toBe('청소 작업 23');
  const oldest = sortLedger(data, 'oldest');
  expect(oldest.rows[0].entry.source.date).toBe('2026-10-01');
  for (const sorted of [latest, oldest]) {
    expect(sorted.rows).toHaveLength(data.rows.length);
    for (const row of sorted.rows) expect(row).toEqual(data.rows.find((original) => original.entry.id === row.entry.id));
    expect(getLedgerDocuments(sorted)[0].rows[0][0]).toContain(sorted.accounts.find((a) => a.id === sorted.rows[0].entry.accountId)!.code);
  }
  expect(data.rows.map((row) => row.entry.id)).toEqual(initialIds);
});

test('100·200 원장의 감소액·음수 누계를 검증하며 손익과 중복 합산하지 않는다', async () => {
  const { assetLedgerFixture, LEDGER_ADVANCE } = await import('./support/accountLedger');
  const { getLedgerSummary } = await import('../src/screens/accounting/ledger/model/accountLedgerReport');
  globalThis.fetch = async (input) => Response.json(assetLedgerFixture(new URL(String(input)).searchParams));
  const all = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    startMonth: '2026-10',
    endMonth: '2026-11'
  });
  expect(all.rows).toHaveLength(8);
  expect(all.rows.some((row) => row.entry.amount.startsWith('-'))).toBe(true);
  expect(all.revenue).toBe('0');
  expect(all.expense).toBe('0');
  const cumulative = new Map<string, bigint>();
  for (const row of sortLedger(all, 'oldest').rows) {
    const total = (cumulative.get(row.entry.accountId) ?? BigInt(0)) + BigInt(row.entry.amount);
    expect(row.cumulativeAmount).toBe(String(total));
    cumulative.set(row.entry.accountId, total);
  }
  const sameDayTransfers = sortLedger(all, 'latest').rows.filter((row) => row.entry.source.kind === 'TRANSFER');
  expect(sameDayTransfers.map((row) => row.entry.amount)).toEqual(['-100000', '100000']);
  expect(sameDayTransfers.map((row) => row.cumulativeAmount)).toEqual(['0', '100000']);
  const credit = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    startMonth: '2026-10',
    endMonth: '2026-11',
    accountId: LEDGER_ADVANCE
  });
  expect(getLedgerSummary(credit)).toEqual([{
    label: '증가 반영액',
    value: BigInt(70000)
  }, {
    label: '감소 반영액',
    value: BigInt(50000)
  }]);
  expect(getLedgerDocuments(credit)[0].rows[0].at(-2)).toBe(BigInt(-50000));
  expect(credit.rows[0].cumulativeAmount).toBe('20000');
});


test('다중 과목 조회는 선택 합집합과 개별 누계를 유지하고 다른 과목 응답을 거부한다', async () => {
  let requestUrl = '';
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return Response.json(ledgerFixture(new URL(requestUrl).searchParams));
  };
  const result = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountIds: [LEDGER_COST, LEDGER_REVENUE]
  });
  expect(new URL(requestUrl).searchParams.get('accountIds')?.split(',').sort()).toEqual([LEDGER_COST, LEDGER_REVENUE].sort());
  expect(result.accountId).toBeNull();
  expect(result.rows).toHaveLength(24);
  expect(getLedgerDocuments(result)[0].description).toContain('401 관리비수입 외 1개');
  globalThis.fetch = async () => Response.json(ledgerFixture());
  await expect(getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountIds: [LEDGER_COST]
  })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
});

test('101은 기초와 입출금을 포함한 잔액을 원본 은행 잔액과 구분해 출력한다', async () => {
  const { assetLedgerFixture, LEDGER_BANK } = await import('./support/accountLedger');
  const value = assetLedgerFixture(new URLSearchParams({
    accountId: LEDGER_BANK
  }));
  globalThis.fetch = async () => Response.json(value);
  const data = await getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountIds: [LEDGER_BANK]
  });
  expect(data.bankBalances[0]).toMatchObject({
    openingBalance: '200000',
    income: '120000',
    expense: '30000',
    closingBalance: '290000'
  });
  expect(data.rows[0].cumulativeAmount).toBe('90000');
  expect(data.rows[0].cashBalance?.ledgerBalance).toBe('290000');
  const report = getLedgerDocuments(data);
  expect(report[0].rows[0]).toContain(BigInt(290000));
  expect(report).toHaveLength(1);
  expect(report[0].columns.map((column) => column.label)).not.toContain('은행 거래 잔액');
  value.bankBalances[0].closingBalance = '90000';
  await expect(getAccountLedger({
    propertyId: SETTLEMENT_PROPERTY,
    accountIds: [LEDGER_BANK]
  })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
});
