import {
  expect,
  test
} from '@playwright/test';
import {
  clearSession,
  setSession
} from '../src/entities/session';
import { getIncomeStatementWorkspace } from '../src/screens/accounting/income-statement/api/incomeStatementApi';
import { incomeFixture } from './support/incomeStatement';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalApiHost = process.env.NEXT_PUBLIC_API_HOST;

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
  if (originalApiHost === undefined) delete process.env.NEXT_PUBLIC_API_HOST;
  else process.env.NEXT_PUBLIC_API_HOST = originalApiHost;
});

test('손익 조회는 인증·조회 범위를 전달하고 예시 대체 없이 서버의 과목·원화·대상을 검증한다', async () => {
  let requestUrl = '';
  let authorization = '';
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return Response.json(incomeFixture());
  };
  const data = await getIncomeStatementWorkspace({
    propertyId: SETTLEMENT_PROPERTY,
    startMonth: '2026-07',
    endMonth: '2026-10'
  });
  expect(authorization).toBe('Bearer test-access');
  expect(requestUrl).toContain('startMonth=2026-07');
  expect(data.isExample).toBe(false);
  expect(data.records).toHaveLength(48);
  for (const malformed of [
    {
      ...incomeFixture(),
      propertyId: 'wrong'
    },
    {
      ...incomeFixture(),
      records: [{
        ...incomeFixture().records[0],
        amount: '1e6'
      }]
    },
    {
      ...incomeFixture(),
      records: [{
        ...incomeFixture().records[0],
        accountId: SETTLEMENT_PROPERTY
      }]
    },
    {
      ...incomeFixture(),
      records: [{
        ...incomeFixture().records[0],
        month: '2026-11'
      }]
    },
    {
      ...incomeFixture(),
      completeness: 'REVIEW_REQUIRED'
    }
  ]) {
    globalThis.fetch = async () => Response.json(malformed);
    await expect(getIncomeStatementWorkspace({
      propertyId: SETTLEMENT_PROPERTY
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
  }
});

test('회계 조회 장애는 빈 원천·0원 응답으로 대체하지 않는다', async () => {
  globalThis.fetch = async () => Response.json({
    code: 'ACCOUNTING_SERVICE_UNAVAILABLE',
    message: '회계 조회 실패'
  }, {
    status: 503
  });
  await expect(getIncomeStatementWorkspace({
    propertyId: SETTLEMENT_PROPERTY
  })).rejects.toMatchObject({
    status: 503
  });
});

test('추가 표시 필드가 없는 이전 서버 응답도 조회하며 잘못된 추가 값은 거부한다', async () => {
  const source = incomeFixture();
  const legacy = {
    ...source,
    completeness: 'REVIEW_REQUIRED',
    buildings: source.buildings.map(({ id, name }) => ({
      id,
      name
    })),
    issues: [{
      id: 'legacy',
      code: 'BUILDING_ATTRIBUTION_REQUIRED',
      label: '과거 부과의 귀속 동 확인 필요',
      amount: '50000',
      path: '/banking/monthly/2026-10/00000000-0000-4000-8000-000000000004?month=2026-10',
      expenseId: null,
      revenueItemId: null
    }]
  };
  globalThis.fetch = async () => Response.json(legacy);
  expect((await getIncomeStatementWorkspace({
    propertyId: SETTLEMENT_PROPERTY
  })).issues).toHaveLength(1);
  globalThis.fetch = async () => Response.json({
    ...legacy,
    issues: [{
      ...legacy.issues[0],
      sourceName: 123
    }]
  });
  await expect(getIncomeStatementWorkspace({
    propertyId: SETTLEMENT_PROPERTY
  })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
});


test('102·201 잔액과 103 원천 연결은 허용하지만 자산을 손익 records로 받거나 선입금을 102로 연결하면 거부한다', async () => {
  const receivable = {
    id: settlementId(9901),
    code: '102',
    name: '미수금',
    group: 'asset',
    systemKey: 'RECEIVABLE'
  };
  const advance = {
    id: settlementId(9902),
    code: '201',
    name: '선수금',
    group: 'liability',
    systemKey: 'ADVANCE_RECEIPT'
  };
  const transfer = {
    id: settlementId(9903),
    code: '103',
    name: '통장간 거래',
    group: 'asset',
    systemKey: null
  };
  const source = {
    ...incomeFixture(),
    accounts: [...incomeFixture().accounts, receivable, advance, transfer],
    households: [{
      unitId: settlementId(9904),
      label: '201호',
      receivableAccountId: receivable.id,
      advanceAccountId: advance.id,
      receivable: '50000',
      advance: '30000',
      path: `/banking/monthly/2026-10/${settlementId(9904)}?month=2026-10`
    }],
    expenses: [{
      id: settlementId(9905),
      transactionId: settlementId(9905),
      date: '2026-10-15',
      name: '통장 이동',
      amount: '10000',
      accountId: transfer.id,
      recognitionMonth: '2026-10',
      revision: 1,
      transferPaymentId: settlementId(9906),
      transferCandidates: [{
        paymentId: settlementId(9906),
        accountName: '상대 통장',
        name: '이체 입금',
        date: '2026-10-15',
        amount: '10000'
      }]
    }],
    otherIncomes: [{
      id: settlementId(9906),
      transactionId: settlementId(9906),
      date: '2026-10-15',
      name: '이체 입금',
      amount: '10000',
      accountId: transfer.id
    }]
  };
  globalThis.fetch = async () => Response.json(source);
  expect((await getIncomeStatementWorkspace({
    propertyId: SETTLEMENT_PROPERTY
  })).households).toHaveLength(1);
  for (const invalid of [
    {
      ...source,
      households: [{
        ...source.households[0],
        advanceAccountId: receivable.id
      }]
    },
    {
      ...source,
      records: [...source.records, {
        ...source.records[0],
        id: 'asset:1',
        accountId: transfer.id,
        accountName: transfer.name,
        group: 'asset'
      }]
    }
  ]) {
    globalThis.fetch = async () => Response.json(invalid);
    await expect(getIncomeStatementWorkspace({
      propertyId: SETTLEMENT_PROPERTY
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
  }
});
