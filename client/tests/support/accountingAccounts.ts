import type { Page } from '@playwright/test';
import type {
  AccountingAccountsWorkspace,
  AccountingAccountSetting
} from '../../src/features/accounting-accounts';
import { DEFAULT_EXPENSE_ACCOUNTS } from '../../src/entities/banking';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './monthlySettlement';

export function accountingAccountsFixture(): AccountingAccountsWorkspace {
  return {
    propertyId: SETTLEMENT_PROPERTY,
    canManage: true,
    accounts: [
      ...DEFAULT_EXPENSE_ACCOUNTS.map((value) => ({
        id: settlementId(Number(value.code)),
        code: value.code,
        name: value.name,
        group: 'OPERATING_EXPENSE' as const,
        defaultAccount: true,
        active: true,
        used: true,
        revision: 0
      })),
      {
        id: settlementId(101),
        code: '101',
        name: '통장',
        group: 'ASSET',
        defaultAccount: true,
        active: true,
        used: true,
        revision: 0
      },
      {
        id: settlementId(401),
        code: '401',
        name: '관리비수입',
        group: 'OPERATING_REVENUE',
        defaultAccount: true,
        active: true,
        used: true,
        revision: 0
      },
      {
        id: settlementId(814),
        code: '814',
        name: '소방점검비',
        group: 'OPERATING_EXPENSE',
        defaultAccount: false,
        active: true,
        used: true,
        revision: 0
      },
      {
        id: settlementId(815),
        code: '815',
        name: '추가 점검비',
        group: 'OPERATING_EXPENSE',
        defaultAccount: false,
        active: true,
        used: false,
        revision: 0
      }
    ] satisfies AccountingAccountSetting[]
  };
}

/** 실제 계정과목 계약의 상태 변경과 실패를 모의 처리하며 화면에서 요청한 값만 반영합니다. */
export async function mockAccountingAccounts(page: Page, options: { manager?: boolean; failure?: boolean; conflict?: boolean } = {}) {
  const data = accountingAccountsFixture();
  data.canManage = !options.manager;
  const requests: { method: string; body: Record<string, unknown> }[] = [];
  let failSave = Boolean(options.conflict);
  const headers = {
    'Access-Control-Allow-Origin': 'http://localhost:3100',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-CSRF-Token'
  };
  await page.route('http://localhost:8080/api/properties/*/accounting/accounts**', async (route) => {
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({
      status: 204,
      headers
    });
    const path = new URL(route.request().url()).pathname;
    if (method === 'GET' && path.endsWith('/history')) return route.fulfill({
      json: [],
      headers
    });
    if (method === 'GET') return route.fulfill({
      status: options.failure ? 503 : 200,
      json: options.failure ? {
        code: 'ACCOUNTING_SERVICE_UNAVAILABLE'
      } : data,
      headers
    });
    const body = route.request().postDataJSON();
    requests.push({
      method,
      body
    });
    if (failSave) {
      failSave = false;
      return route.fulfill({
        status: 409,
        json: {
          code: 'ACCOUNTING_ACCOUNT_CONFLICT'
        },
        headers
      });
    }
    const id = path.split('/').at(-1) === 'status' ? path.split('/').at(-2) : path.split('/').at(-1);
    const account = data.accounts.find((value) => value.id === id);
    if (path.endsWith('/accounts')) {
      const created = {
        id: settlementId(816),
        name: body.name,
        code: body.code || '816',
        group: body.group,
        defaultAccount: false,
        active: true,
        used: false,
        revision: 0
      };
      data.accounts.push(created);
      return route.fulfill({
        json: {
          id: created.id
        },
        headers
      });
    }
    if (!account) throw new Error('Unknown account in test');
    if (method === 'DELETE') data.accounts = data.accounts.filter((value) => value.id !== account.id);
    else if (path.endsWith('/status')) { account.active = body.active; account.revision++; }
    else { account.name = body.name; account.code = body.code; account.group = body.group; account.revision++; }
    await route.fulfill({
      status: 204,
      headers
    });
  });
  return {
    data,
    requests
  };
}
