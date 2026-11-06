import type {
  AccountingAccount,
  AccountingIssue
} from '../../src/screens/accounting/income-statement/api/incomeStatementApiTypes';
import type { Page } from '@playwright/test';
import { createIncomeStatementExample } from './incomeExample';
import {
  settlementId,
  SETTLEMENT_PROPERTY
} from './monthlySettlement';

export const INCOME_BUILDING_A = settlementId(8101);
export const INCOME_BUILDING_B = settlementId(8102);

/** 실제 응답 계약의 UUID·계정 연결을 사용하는 브라우저 전용 모의 자료입니다. */
export function incomeFixture() {
  const source = createIncomeStatementExample();
  const names = new Map(source.records.map((row) => [row.accountId, {
    name: row.accountName,
    group: row.group
  }]));
  const ids = new Map([...names.keys()].map((id, index) => [id, settlementId(8200 + index)]));
  return {
    propertyId: SETTLEMENT_PROPERTY,
    propertyName: '테스트 관리대상',
    generatedAt: '2026-11-04T12:00:00Z',
    range: source.availableRange,
    configuration: {
      startMonth: '2026-07',
      fiscalYearStartMonth: 1
    },
    canManage: true,
    completeness: 'READY',
    buildings: [{
      id: INCOME_BUILDING_A,
      name: 'A동',
      deleted: false
    }, {
      id: INCOME_BUILDING_B,
      name: 'B동',
      deleted: false
    }, {
      id: settlementId(8103),
      name: 'A동',
      deleted: true
    }],
    accounts: [...names].map(([id, value]) => ({
      id: ids.get(id)!,
      ...value,
      systemKey: id === 'management-revenue' ? 'MANAGEMENT_REVENUE' : null
    })),
    records: source.records.map((row) => ({
      ...row,
      accountId: ids.get(row.accountId)!,
      buildingId: row.buildingId === 'example-a' ? INCOME_BUILDING_A : INCOME_BUILDING_B
    })),
    issues: [] as AccountingIssue[],
    expenses: [],
    revenueItems: []
  };
}

export async function mockIncomeStatement(page: Page, options: { manager?: boolean; failure?: boolean; sources?: boolean } = {}) {
  await page.route('http://localhost:8080/api/properties/*/accounting/income-statement**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const data = incomeFixture();
    data.canManage = !options.manager;
    if (options.sources) {
      data.completeness = 'REVIEW_REQUIRED';
      data.issues = Array.from({
        length: 23
      }, (_, index) => ({
        id: `source:${index}`,
        code: 'SOURCE_REVIEW_REQUIRED',
        label: index === 0 ? '지출 확인' : index === 1 ? '음수 청구 확인' : index === 2 ? '기타 입금 확인' : `미반영 자료 ${index + 1}`,
        sourceName: index === 0 ? '전기요금' : index === 1 ? '관리비 부과' : index === 2 ? '기타 입금' : `미반영 자료 ${index + 1}`,
        sourceContext: index === 1 ? '2026-10 부과 · 동 정보 없음 · 101호' : '거래일 2026-10-15 · 부담처 A동, 외부 관리단',
        amount: '20000',
        path: index === 1 ? `/banking/monthly/2026-10/${settlementId(4)}?month=2026-10` : index === 2 ? `/banking/receipts/${settlementId(71)}` : `/banking/transactions/${settlementId(11)}`,
        expenseId: null,
        revenueItemId: null
      }));
    }
    data.range = {
      startMonth: params.get('startMonth') ?? data.range.startMonth,
      endMonth: params.get('endMonth') ?? data.range.endMonth
    };
    if (data.range.startMonth < data.configuration.startMonth) {
      data.completeness = 'BEFORE_START';
      data.records = [];
    } else {
      const building = params.get('buildingId');
      data.records = data.records.filter((row) => row.month >= data.range.startMonth && row.month <= data.range.endMonth && (!building || row.buildingId === building));
    }
    await route.fulfill({
      status: options.failure ? 503 : 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      contentType: 'application/json',
      body: JSON.stringify(options.failure ? {
        code: 'ACCOUNTING_SERVICE_UNAVAILABLE',
        message: '회계 조회 실패'
      } : data)
    });
  });
}

/** 설정·과목 매칭·지출 날짜 귀속·매칭 충돌을 실제 HTTP 요청 순서로 검증합니다. */
export async function mockAccountingLifecycle(page: Page, options: { accounts?: AccountingAccount[] } = {}) {
  const ids = {
    revenueAccount: settlementId(8301),
    revenueItem: settlementId(8302),
    expense: settlementId(8303),
    costAccount: settlementId(8304)
  };
  const state = {
    configured: false,
    revenue: false,
    revenueRevision: 0,
    expenseMonth: null as string | null,
    expenseRevision: 0,
    account: '',
    conflict: false
  };
  const headers = {
    'Access-Control-Allow-Origin': 'http://localhost:3100',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  await page.route('http://localhost:8080/api/properties/*/accounting/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({
      status: 200,
      headers
    });
    const url = new URL(request.url());
    let body: unknown = {};
    let status = 200;
    if (request.method() === 'POST') {
      const input = request.postDataJSON();
      if (url.pathname.endsWith('/settings')) state.configured = true;
      else if (url.pathname.endsWith('/accounts')) {
        state.account = input.name;
        body = {
          id: ids.costAccount
        };
      } else if (url.pathname.includes('/revenue-items/')) {
        state.revenue = input.recognized;
        state.revenueRevision++;
      } else if (url.pathname.includes('/expenses/')) {
        if (state.conflict || input.expectedRevision !== state.expenseRevision) {
          status = 409;
          body = {
            code: 'ACCOUNTING_REVIEW_CONFLICT',
            message: '최신 회계 자료를 다시 확인해주세요.'
          };
        } else {
          state.expenseMonth = '2026-10';
          state.expenseRevision++;
        }
      }
    } else {
      const range = {
        startMonth: url.searchParams.get('startMonth') ?? '2026-10',
        endMonth: url.searchParams.get('endMonth') ?? '2026-10'
      };
      const issues = [
        ...(!state.revenue ? [{
          id: `revenue:${ids.revenueItem}`,
          code: 'REVENUE_CLASSIFICATION_REQUIRED',
          label: '일반관리비 성격 확인 필요',
          sourceName: '일반관리비',
          sourceContext: '2026-10 ~ 2026-10 부과 합계',
          amount: '1000000',
          path: '/billing/monthly?month=2026-10',
          expenseId: null,
          revenueItemId: ids.revenueItem
        }] : []),
        ...(!state.expenseMonth ? [{
          id: `expense:${ids.expense}`,
          code: 'EXPENSE_ACCOUNTING_REVIEW_REQUIRED',
          label: '청소비 과목 확인 필요',
          sourceName: '청소비',
          sourceContext: '거래일 2026-10-15',
          amount: '1500000',
          path: `/banking/transactions/${ids.expense}`,
          expenseId: ids.expense,
          revenueItemId: null
        }] : [])
      ];
      body = {
        propertyId: SETTLEMENT_PROPERTY,
        propertyName: '테스트 관리대상',
        generatedAt: new Date().toISOString(),
        range,
        configuration: state.configured ? {
          startMonth: '2026-10',
          fiscalYearStartMonth: 1
        } : null,
        canManage: true,
        completeness: !state.configured ? 'SETUP_REQUIRED' : issues.length ? 'REVIEW_REQUIRED' : 'READY',
        buildings: [],
        accounts: [
          {
            id: ids.revenueAccount,
            code: '401',
            name: '관리비수익',
            group: 'operatingRevenue',
            systemKey: 'MANAGEMENT_REVENUE'
          },
          ...(options.accounts ?? []),
          ...(state.account ? [{
            id: ids.costAccount,
            name: state.account,
            group: 'operatingExpense',
            systemKey: null
          }] : [])
        ],
        records: !state.configured ? [] : [
          ...(state.revenue ? [{
            id: 'charge:1',
            accountId: ids.revenueAccount,
            accountName: '관리비수익',
            group: 'operatingRevenue',
            month: '2026-10',
            buildingId: null,
            amount: '1000000'
          }] : []),
          ...(state.expenseMonth && state.expenseMonth >= range.startMonth && state.expenseMonth <= range.endMonth
            ? [{
              id: 'expense:1',
              accountId: ids.costAccount,
              accountName: state.account,
              group: 'operatingExpense',
              month: state.expenseMonth,
              buildingId: null,
              amount: '1500000'
            }] : [])
        ],
        issues: state.configured ? issues : [],
        revenueItems: state.configured ? [{
          id: ids.revenueItem,
          name: '일반관리비',
          amount: '1000000',
          recognized: state.revenue,
          revision: state.revenueRevision
        }] : [],
        expenses: state.configured ? [{
          id: ids.expense,
          transactionId: ids.expense,
          date: '2026-10-15',
          name: '청소비',
          amount: '1500000',
          accountId: state.expenseMonth ? ids.costAccount : null,
          recognitionMonth: state.expenseMonth,
          revision: state.expenseRevision
        }] : []
      };
    }
    await route.fulfill({
      status,
      headers,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
  return state;
}
