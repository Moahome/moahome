import {
  expect,
  test
} from '@playwright/test';
import {
  clearSession,
  setSession
} from '../src/entities/session';
import {
  getAccountingAccounts,
  editAccountingAccount,
  changeAccountingAccountStatus,
  deleteAccountingAccount
} from '../src/features/accounting-accounts';
import { accountingAccountsFixture } from './support/accountingAccounts';
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

test('계정 목록은 인증과 대상·코드·분류·중복을 검증하고 코드순으로 반환한다', async () => {
  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return Response.json(accountingAccountsFixture());
  };
  const data = await getAccountingAccounts(SETTLEMENT_PROPERTY);
  expect(authorization).toBe('Bearer test-access');
  expect(data.accounts[0].code).toBe('101');
  for (const malformed of [
    {
      ...accountingAccountsFixture(),
      propertyId: settlementId(999)
    },
    {
      ...accountingAccountsFixture(),
      canManage: 'yes'
    },
    {
      ...accountingAccountsFixture(),
      accounts: [{
        ...data.accounts[0],
        group: 'WRONG'
      }]
    },
    {
      ...accountingAccountsFixture(),
      accounts: [{
        ...data.accounts[0],
        code: '801'
      }]
    },
    {
      ...accountingAccountsFixture(),
      accounts: [data.accounts[0], data.accounts[0]]
    }
  ]) {
    globalThis.fetch = async () => Response.json(malformed);
    await expect(getAccountingAccounts(SETTLEMENT_PROPERTY)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    });
  }
  globalThis.fetch = async () => Response.json({
    code: 'ACCOUNTING_SERVICE_UNAVAILABLE'
  }, {
    status: 503
  });
  await expect(getAccountingAccounts(SETTLEMENT_PROPERTY)).rejects.toMatchObject({
    status: 503
  });
});

test('수정·중지·삭제는 기대 revision과 인증을 전송하며 충돌을 숨기지 않는다', async () => {
  const requests: { method: string; body: unknown }[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({
      method: init?.method ?? 'GET',
      body: JSON.parse(String(init?.body))
    });
    return new Response(null, {
      status: 204
    });
  };
  const id = settlementId(814);
  await editAccountingAccount(SETTLEMENT_PROPERTY, id, {
    name: '점검비',
    group: 'OPERATING_EXPENSE',
    code: '814',
    expectedRevision: 2
  });
  await changeAccountingAccountStatus(SETTLEMENT_PROPERTY, id, false, 3);
  await deleteAccountingAccount(SETTLEMENT_PROPERTY, id, 4);
  expect(requests.map((value) => value.method)).toEqual(['PUT', 'POST', 'DELETE']);
  expect(requests.map((value) => value.body)).toEqual([
    {
      name: '점검비',
      group: 'OPERATING_EXPENSE',
      code: '814',
      expectedRevision: 2
    },
    {
      active: false,
      expectedRevision: 3
    }, {
      expectedRevision: 4
    }
  ]);
  globalThis.fetch = async () => Response.json({
    code: 'ACCOUNTING_ACCOUNT_CONFLICT'
  }, {
    status: 409
  });
  await expect(changeAccountingAccountStatus(SETTLEMENT_PROPERTY, id, true, 1)).rejects.toMatchObject({
    status: 409,
    code: 'ACCOUNTING_ACCOUNT_CONFLICT'
  });
});
