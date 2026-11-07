import {
  expect,
  test
} from '@playwright/test';
import {
  setSession,
  clearSession
} from '../src/entities/session';
import { getPayables } from '../src/features/payable-management/api/payableApi';
import {
  payableFixture,
  PAYABLE_ID
} from './support/payable';
import {
  LEDGER_BUILDING,
  LEDGER_COST,
  LEDGER_PAYABLE
} from './support/accountLedger';
import { SETTLEMENT_PROPERTY } from './support/monthlySettlement';
import { getTodayDate } from '../src/shared/lib/date-range';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const host = process.env.NEXT_PUBLIC_API_HOST;

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
  clearSession(); globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  if (host === undefined) delete process.env.NEXT_PUBLIC_API_HOST; else process.env.NEXT_PUBLIC_API_HOST = host;
});

test('미지급 조회는 인증·대상을 전달하고 지급액과 남은 금액을 대조한다', async () => {
  const value = payableFixture();
  value.items.push({
    id: PAYABLE_ID,
    date: getTodayDate(),
    name: '청소 용역비',
    counterparty: '업체',
    memo: null,
    accountId: LEDGER_COST,
    payableAccountId: LEDGER_PAYABLE,
    buildingId: LEDGER_BUILDING,
    amount: '100000',
    paid: '40000',
    remaining: '60000',
    status: 'REGISTERED',
    payments: [{
      id: LEDGER_COST,
      expenseId: LEDGER_COST,
      date: getTodayDate(),
      amount: '40000',
      status: 'ACTIVE',
      path: `/banking/transactions/${LEDGER_COST}`
    }]
  });
  let authorization = '';
  globalThis.fetch = async (_input, init) => { authorization = new Headers(init?.headers).get('Authorization') ?? ''; return Response.json(value); };
  const data = await getPayables(SETTLEMENT_PROPERTY);
  expect(authorization).toBe('Bearer test-access');
  expect(data.items[0].remaining).toBe('60000');
  for (const mutate of [
    () => { value.propertyId = LEDGER_COST; },
    () => { value.items[0].paid = '30000'; },
    () => { value.items[0].remaining = '1'; },
    () => { value.items[0].payments[0].path = '//example.com'; }
  ]) {
    const before = structuredClone(value);
    mutate();
    await expect(getPayables(SETTLEMENT_PROPERTY)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
    Object.assign(value, before);
  }
});
