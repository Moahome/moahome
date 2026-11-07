import type { Page } from '@playwright/test';
import type {
  AccountLedgerWorkspace,
  LedgerRow
} from '../../src/screens/accounting/ledger/api/accountLedgerApiTypes';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './monthlySettlement';

export const LEDGER_COST = settlementId(9701);
export const LEDGER_REVENUE = settlementId(9702);
export const LEDGER_BANK = settlementId(9703);
export const LEDGER_PAYABLE = settlementId(9705);
export const LEDGER_RECEIVABLE = settlementId(9706);
export const LEDGER_ADVANCE = settlementId(9707);
export const LEDGER_TRANSFER = settlementId(9708);
export const LEDGER_BUILDING = settlementId(9704);

/** 브라우저와 응답 검증에 쓰는 원장 계약 자료이며 실제 DB 자료를 대체하지 않습니다. */
export function ledgerFixture(params = new URLSearchParams()): AccountLedgerWorkspace {
  const accountIds = [...new Set(params.get('accountIds')?.split(',') ?? params.getAll('accountId'))].filter(Boolean).sort();
  const accountId = accountIds.length === 1 ? accountIds[0] : null;
  const buildingId = params.get('buildingId');
  const range = {
    startMonth: params.get('startMonth') ?? '2026-10',
    endMonth: params.get('endMonth') ?? '2026-10'
  };
  const supported = true;
  const entries: LedgerRow['entry'][] = Array.from({
    length: 23
  }, (_, index) => ({
    id: `expense:${index}`,
    accountId: LEDGER_COST,
    accountName: '청소비',
    group: 'operatingExpense',
    month: '2026-10',
    buildingId: LEDGER_BUILDING,
    amount: String(1000 + index),
    source: {
      kind: 'EXPENSE',
      id: settlementId(9800 + index),
      date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      time: '10:30:00',
      name: `청소 작업 ${index + 1}`,
      context: '부담처 102동',
      path: `/banking/transactions/${settlementId(11)}`
    }
  }));
  entries.unshift({
    id: 'billing:2026-10:' + LEDGER_REVENUE,
    accountId: LEDGER_REVENUE,
    accountName: '관리비수입',
    group: 'operatingRevenue',
    month: '2026-10',
    buildingId: LEDGER_BUILDING,
    amount: '100000',
    source: {
      kind: 'BILLING',
      id: null,
      date: '2026-10-01',
      time: null,
      name: '일반관리비',
      context: '2026-10 부과 · 102동 101호',
      path: '/billing/monthly/history/2026-10'
    }
  });
  const cumulative = new Map<string, bigint>();
  let revenue = BigInt(0);
  let expense = BigInt(0);
  const rows = entries.filter((entry) => supported && (!accountIds.length || accountIds.includes(entry.accountId))
    && (!buildingId || entry.buildingId === buildingId) && entry.month >= range.startMonth && entry.month <= range.endMonth)
    .map((entry) => {
      const total = (cumulative.get(entry.accountId) ?? BigInt(0)) + BigInt(entry.amount);
      cumulative.set(entry.accountId, total);
      if (entry.group.endsWith('Revenue')) revenue += BigInt(entry.amount);
      else if (entry.group.endsWith('Expense')) expense += BigInt(entry.amount);
      return {
        entry,
        cumulativeAmount: String(total),
        sourceIds: entry.source.kind === 'BILLING' ? [`charge:${settlementId(9901)}`] : [entry.id]
      };
    }).reverse();
  return {
    propertyId: SETTLEMENT_PROPERTY,
    propertyName: '테스트 관리대상',
    generatedAt: '2026-11-07T00:00:00Z',
    range,
    configuration: {
      startMonth: '2026-10',
      fiscalYearStartMonth: 1
    },
    completeness: range.startMonth < '2026-10' ? 'BEFORE_START' : 'READY',
    supported,
    canManage: true,
    accountId,
    accountIds,
    bankAccountId: params.get('bankAccountId'),
    bankBalances: [],
    buildingId,
    buildings: [{
      id: LEDGER_BUILDING,
      name: '102동',
      deleted: false
    }],
    accounts: [
      {
        id: LEDGER_PAYABLE,
        code: '202',
        name: '미지급금',
        group: 'liability',
        systemKey: 'PAYABLE'
      },
      {
        id: LEDGER_BANK,
        code: '101',
        name: '통장',
        group: 'asset',
        systemKey: 'BANK'
      },
      {
        id: LEDGER_REVENUE,
        code: '401',
        name: '관리비수입',
        group: 'operatingRevenue',
        systemKey: 'MANAGEMENT_REVENUE'
      },
      {
        id: LEDGER_COST,
        code: '802',
        name: '청소비',
        group: 'operatingExpense',
        systemKey: null
      }
    ],
    rows,
    issues: [],
    revenue: String(revenue),
    expense: String(expense)
  };
}

export async function mockLedger(page: Page, options: { failure?: boolean; setup?: boolean; review?: boolean } = {}) {
  await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', async (route) => {
    const value = ledgerFixture(new URL(route.request().url()).searchParams);
    if (options.setup || value.completeness === 'BEFORE_START') {
      if (options.setup) {
        value.configuration = null;
        value.completeness = 'SETUP_REQUIRED';
      }
      value.rows = [];
      value.revenue = '0';
      value.expense = '0';
    }
    if (options.review) {
      value.completeness = 'REVIEW_REQUIRED';
      value.issues = [{
        id: 'review:1',
        code: 'EXPENSE_ACCOUNTING_REVIEW_REQUIRED',
        label: '과목 확인 필요',
        amount: '2000',
        path: `/banking/transactions/${settlementId(11)}`,
        sourceName: '미지정 지출',
        sourceContext: '2026-10-12 · 102동'
      }];
    }
    await route.fulfill({
      status: options.failure ? 503 : 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      json: options.failure ? {
        code: 'ACCOUNTING_SERVICE_UNAVAILABLE',
        message: '조회 실패'
      } : value
    });
  });
}

/** 뒤섞인 20세대 부과를 한 건의 100만원 수익으로 조회하고 같은 항목 ID의 기존 부과 상세를 제공합니다. */
export async function mockLedgerBilling(page: Page) {
  const charges = Array.from({
    length: 20
  }, (_, index) => ({
    id: settlementId(12000 + index),
    unitId: settlementId(12100 + index),
    building: index < 10 ? '102동' : '103동',
    room: String(201 + Math.floor(index % 10 / 2) * 100 + index % 2),
    displayName: null,
    representativeName: null,
    items: [{
      id: settlementId(12200 + index),
      code: 'GENERAL_MANAGEMENT',
      name: '일반관리비',
      amount: '50000'
    }]
  }));
  await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const data = ledgerFixture(params);
    const month = params.get('endMonth') ?? '2026-11';
    data.range = {
      startMonth: month,
      endMonth: month
    };
    data.accountIds = (params.get('accountIds')?.split(',') ?? params.getAll('accountId')).filter(Boolean).sort();
    data.accountId = data.accountIds.length === 1 ? data.accountIds[0] : null;
    const selected = params.get('buildingId') ? charges.filter((row) => row.building === '102동') : charges;
    const amount = String(selected.length * 50000);
    data.rows = [{
      entry: {
        id: `billing:${month}:${LEDGER_REVENUE}`,
        accountId: LEDGER_REVENUE,
        accountName: '관리비수입',
        group: 'operatingRevenue',
        month,
        buildingId: params.get('buildingId'),
        amount,
        source: {
          kind: 'BILLING',
          id: null,
          date: `${month}-01`,
          time: null,
          name: '일반관리비',
          context: `${month} 부과 합계`,
          path: `/billing/monthly/history/${month}`
        }
      },
      cumulativeAmount: amount,
      sourceIds: selected.map((charge) => `charge:${charge.items[0].id}`)
    }];
    data.revenue = amount;
    data.expense = '0';
    await route.fulfill({
      json: data,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.route('http://localhost:8080/api/properties/*/billing/monthly/*', async (route) => {
    const month = new URL(route.request().url()).pathname.split('/').at(-1)!;
    await route.fulfill({
      json: {
        propertyId: SETTLEMENT_PROPERTY,
        hasBuildings: true,
        month,
        billingDate: `${month}-01`,
        dueDate: `${month}-30`,
        status: 'ISSUED',
        baseAmount: '50000',
        charges: [...charges].reverse()
      },
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
}

/** 자산·부채는 부호 있는 원본 증가·감소이며 손익 합계에는 포함하지 않는 계약 자료입니다. */
export function assetLedgerFixture(params = new URLSearchParams()): AccountLedgerWorkspace {
  const value = ledgerFixture(params);
  value.accounts.push(
    {
      id: LEDGER_RECEIVABLE,
      code: '102',
      name: '미수금',
      group: 'asset',
      systemKey: 'RECEIVABLE'
    },
    {
      id: LEDGER_TRANSFER,
      code: '103',
      name: '통장간 거래',
      group: 'asset',
      systemKey: null
    },
    {
      id: LEDGER_ADVANCE,
      code: '201',
      name: '선수금',
      group: 'liability',
      systemKey: 'ADVANCE_RECEIPT'
    }
  );
  const definitions = [
    {
      account: LEDGER_BANK,
      date: '2026-10-15',
      amount: '120000',
      kind: 'BANK',
      name: '관리비 입금'
    },
    {
      account: LEDGER_BANK,
      date: '2026-10-20',
      amount: '-30000',
      kind: 'BANK',
      name: '관리비 출금'
    },
    {
      account: LEDGER_RECEIVABLE,
      date: '2026-10-01',
      amount: '50000',
      kind: 'RECEIVABLE',
      name: '102동 201호 관리비 부과'
    },
    {
      account: LEDGER_RECEIVABLE,
      date: '2026-10-15',
      amount: '-50000',
      kind: 'RECEIPT',
      name: '102동 201호 수납 충당'
    },
    {
      account: LEDGER_TRANSFER,
      date: '2026-10-20',
      amount: '-100000',
      kind: 'TRANSFER',
      name: '통장간 거래 · 출금'
    },
    {
      account: LEDGER_TRANSFER,
      date: '2026-10-20',
      amount: '100000',
      kind: 'TRANSFER',
      name: '통장간 거래 · 입금'
    },
    {
      account: LEDGER_ADVANCE,
      date: '2026-10-15',
      amount: '70000',
      kind: 'RECEIPT',
      name: '102동 201호 초과 수납'
    },
    {
      account: LEDGER_ADVANCE,
      date: '2026-11-01',
      amount: '-50000',
      kind: 'RECEIPT',
      name: '102동 201호 관리비 충당'
    }
  ] as const;
  const entries: LedgerRow['entry'][] = definitions.map((row, index) => {
    const account = value.accounts.find((account) => account.id === row.account)!;
    const id = settlementId(9950 + index);
    const path = row.kind === 'RECEIVABLE'
      ? `/banking/monthly/${row.date.slice(0, 7)}/${settlementId(9960)}?month=${row.date.slice(0, 7)}`
      : row.kind === 'RECEIPT' ? `/banking/receipts/${id}`
        : `/banking/transactions?account=${settlementId(9961)}&startDate=${row.date}&endDate=${row.date}`;
    return {
      id: `asset:${id}`,
      accountId: account.id,
      accountName: account.name,
      group: account.group,
      month: row.date.slice(0, 7),
      buildingId: LEDGER_BUILDING,
      amount: row.amount,
      source: {
        kind: row.kind,
        id,
        date: row.date,
        time: null,
        name: row.name,
        context: '',
        path
      }
    };
  });
  const cumulative = new Map<string, bigint>();
  value.rows = entries.filter((entry) => (!value.accountIds.length || value.accountIds.includes(entry.accountId))
    && (!value.buildingId || entry.buildingId === value.buildingId)
    && entry.month >= value.range.startMonth && entry.month <= value.range.endMonth)
    .sort((a, b) => a.source.date!.localeCompare(b.source.date!)
      || Number(BigInt(a.amount) < BigInt(0)) - Number(BigInt(b.amount) < BigInt(0))
      || a.source.name.localeCompare(b.source.name, 'ko', {
        numeric: true
      }) || a.id.localeCompare(b.id))
    .map((entry) => {
      const total = (cumulative.get(entry.accountId) ?? BigInt(0)) + BigInt(entry.amount);
      cumulative.set(entry.accountId, total);
      return {
        entry,
        cumulativeAmount: String(total),
        sourceIds: [entry.id]
      };
    }).reverse();
  if (value.rows.some((row) => row.entry.accountId === LEDGER_BANK)) {
    const bankId = settlementId(9961);
    value.bankBalances = [{
      accountId: bankId,
      name: '공용 통장',
      openingBalance: '200000',
      income: '120000',
      expense: '30000',
      closingBalance: '290000'
    }];
    value.rows = value.rows.map((row) => row.entry.accountId !== LEDGER_BANK ? row : {
      ...row,
      cashBalance: {
        bankAccountId: bankId,
        bankAccountName: '공용 통장',
        ledgerBalance: row.entry.amount === '120000' ? '320000' : '290000',
        reportedBalance: row.entry.amount === '120000' ? '320000' : '290000'
      }
    });
  }
  if (value.bankAccountId) value.rows = value.rows.filter((row) => row.cashBalance?.bankAccountId === value.bankAccountId);
  value.revenue = '0';
  value.expense = '0';
  return value;
}
