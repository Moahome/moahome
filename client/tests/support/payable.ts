import type { Page } from '@playwright/test';
import type {
  PayableItem,
  PayableWorkspace
} from '../../src/features/payable-management/api/payableApiTypes';
import type { LedgerRow } from '../../src/screens/accounting/ledger/api/accountLedgerApiTypes';
import { getTodayDate } from '../../src/shared/lib/date-range';
import {
  ledgerFixture,
  LEDGER_BUILDING,
  LEDGER_COST,
  LEDGER_PAYABLE
} from './accountLedger';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './monthlySettlement';

export const PAYABLE_ID = settlementId(10501);
export const PAYABLE_BANK_EXPENSE = settlementId(10502);
export const PAYABLE_BANK_EXPENSE_SECOND = settlementId(10503);

export function payableFixture(): PayableWorkspace {
  return {
    propertyId: SETTLEMENT_PROPERTY,
    hasBuildings: true,
    canManage: true,
    accounts: [{
      id: LEDGER_COST,
      code: '802',
      name: '청소비'
    }],
    buildings: [{
      id: LEDGER_BUILDING,
      name: '102동',
      active: true
    }],
    items: [],
    candidates: [
      {
        expenseId: PAYABLE_BANK_EXPENSE,
        date: getTodayDate(),
        name: '청소비 1차 지급',
        amount: '40000',
        accountId: LEDGER_COST,
        buildingId: LEDGER_BUILDING,
        path: `/banking/transactions/${PAYABLE_BANK_EXPENSE}`
      },
      {
        expenseId: PAYABLE_BANK_EXPENSE_SECOND,
        date: getTodayDate(),
        name: '청소비 2차 지급',
        amount: '60000',
        accountId: LEDGER_COST,
        buildingId: LEDGER_BUILDING,
        path: `/banking/transactions/${PAYABLE_BANK_EXPENSE_SECOND}`
      }
    ]
  };
}

/** 서비스·PostgreSQL 검사와 같은 10만원→4만원→6만원의 상태를 브라우저 계약 응답으로 제공합니다. */
export async function mockPayables(page: Page, options: { manager?: boolean; lostFirstPaymentResponse?: boolean; withItem?: boolean } = {}) {
  const workspace = payableFixture();
  workspace.canManage = !options.manager;
  const receivedPaymentIds: string[] = [];
  let lost = false;
  if (options.withItem) workspace.items.push({
    id: PAYABLE_ID,
    date: getTodayDate(),
    name: '청소 용역비',
    counterparty: '청소 업체',
    memo: '',
    accountId: LEDGER_COST,
    payableAccountId: LEDGER_PAYABLE,
    buildingId: LEDGER_BUILDING,
    amount: '100000',
    paid: '0',
    remaining: '100000',
    status: 'REGISTERED',
    payments: []
  });
  await page.route('http://localhost:8080/api/properties/*/accounting/payables**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      await route.fulfill({
        json: {
          ...workspace,
          candidates: workspace.candidates.filter((v) => !workspace.items.some((item) => item.payments.some((p) => p.status === 'ACTIVE' && p.expenseId === v.expenseId)))
        }
      }); return;
    }
    if (!workspace.canManage) { await route.fulfill({
      status: 403,
      json: {
        code: 'ACCESS_DENIED',
        message: '권한이 없습니다.'
      }
    }); return; }
    if (path.endsWith('/payables')) {
      const body = request.postDataJSON();
      if (!workspace.items.some((item) => item.id === body.id)) workspace.items.push({
        ...body,
        payableAccountId: LEDGER_PAYABLE,
        paid: '0',
        remaining: body.amount,
        status: 'REGISTERED',
        payments: []
      });
    } else {
      const item = workspace.items.find((v) => path.includes(`/${v.id}/`))!;
      if (path.endsWith('/payments')) {
        const body = request.postDataJSON(); receivedPaymentIds.push(body.id);
        const candidate = workspace.candidates.find((v) => v.expenseId === body.expenseId)!;
        if (!item.payments.some((v) => v.id === body.id)) item.payments.push({
          id: body.id,
          expenseId: candidate.expenseId,
          date: candidate.date,
          amount: candidate.amount,
          status: 'ACTIVE',
          path: candidate.path
        });
        recalculate(item);
        if (options.lostFirstPaymentResponse && !lost) { lost = true; await route.fulfill({
          status: 503,
          json: {
            code: 'ACCOUNTING_SERVICE_UNAVAILABLE',
            message: '지급 응답을 확인하지 못했습니다.'
          }
        }); return; }
      } else if (path.includes('/payments/')) {
        const payment = item.payments.find((v) => path.includes(`/${v.id}/`))!; payment.status = 'CANCELED'; recalculate(item);
      } else { item.status = 'CANCELED'; item.remaining = '0'; }
    }
    await route.fulfill({
      status: 204
    });
  });
  await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const value = ledgerFixture(params); value.canManage = workspace.canManage;
    const entries: LedgerRow['entry'][] = [];
    for (const item of workspace.items.filter((v) => v.status === 'REGISTERED')) {
      const source = {
        kind: 'PAYABLE' as const,
        id: item.id,
        date: item.date,
        time: null,
        name: item.name,
        context: item.counterparty,
        path: `/accounting/payables/${item.id}`
      };
      entries.push({
        id: `payable:${item.id}`,
        accountId: LEDGER_PAYABLE,
        accountName: '미지급금',
        group: 'liability',
        month: item.date.slice(0, 7),
        buildingId: item.buildingId,
        amount: item.amount,
        source
      });
      for (const payment of item.payments.filter((v) => v.status === 'ACTIVE')) entries.push({
        ...entries[entries.length - 1],
        id: `payable-payment:${payment.id}`,
        amount: `-${payment.amount}`,
        source: {
          ...source,
          date: payment.date
        }
      });
    }
    let cumulative = BigInt(0);
    value.rows = entries.filter((entry) => (!value.accountIds.length || value.accountIds.includes(entry.accountId)) && entry.month >= value.range.startMonth && entry.month <= value.range.endMonth).map((entry) => {
      cumulative += BigInt(entry.amount); return {
        entry,
        cumulativeAmount: String(cumulative),
        sourceIds: [entry.id]
      };
    }).reverse();
    value.revenue = '0'; value.expense = '0';
    await route.fulfill({
      json: value
    });
  });
  return {
    workspace,
    receivedPaymentIds
  };
}

function recalculate(item: PayableItem) {
  item.paid = String(item.payments.filter((v) => v.status === 'ACTIVE').reduce((sum, v) => sum + BigInt(v.amount), BigInt(0)));
  item.remaining = String(BigInt(item.amount) - BigInt(item.paid));
}
