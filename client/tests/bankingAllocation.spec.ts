import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import type {
  BankingTransaction,
  BankingWorkspaceData,
  ExpenseDraft
} from '../src/widgets/banking-workspace/api/bankingApiTypes';
import {
  calculateExpenseAllocation,
  createExpenseDraft
} from '../src/widgets/banking-workspace/model/expenseAllocation';
import { getAccountsForMonth } from '../src/widgets/banking-workspace/model/bankAccountVisibility';
import { createExpenseWorkbook } from '../src/widgets/banking-workspace/model/expenseExport';

test('관리실 거래는 내용으로 지출명을 채우고 별도 항목 입력 없이 지출을 준비', () => {
  const row = {
    payer: '관리실',
    accountId: 'account',
    ruleKey: 'key'
  } as BankingTransaction;
  const workspace = {
    rules: [],
    buildings: [{
      id: '103',
      label: '103동'
    }, {
      id: '102',
      label: '102동'
    }]
  } as unknown as BankingWorkspaceData;
  const result = createExpenseDraft(row, workspace);
  expect(result.category).toBe('관리실');
  expect(result.allocations.map((part) => part.label)).toEqual(['102동', '103동']);
  expect(workspace.buildings.map((part) => part.label)).toEqual(['103동', '102동']);
  expect(calculateExpenseAllocation('100000', result).error).toBe('');
  expect(calculateExpenseAllocation('100000', result).allocations.map((part) => part.amount)).toEqual(['50000', '50000']);
});

function draft(mode: ExpenseDraft['mode'], parts: { label: string; amount?: string; percentage?: string }[]): ExpenseDraft {
  return {
    category: '공동 비용',
    note: '',
    mode,
    saveAsRule: false,
    allocations: parts.map((p) => ({
      buildingId: null,
      label: p.label,
      amount: p.amount ?? '',
      percentage: p.percentage ?? null
    }))
  };
}
test('승강기는 두 동 균등, 전기료는 1/4·1/4·외부 1/2로 계산', () => {
  const elevator = calculateExpenseAllocation('506000', draft('EQUAL', [{
    label: '102동'
  }, {
    label: '103동'
  }]));
  expect(elevator.error).toBe(''); expect(elevator.allocations.map((a) => a.amount)).toEqual(['253000', '253000']);
  const power = calculateExpenseAllocation('182660', draft('RATIO', [{
    label: '102동',
    percentage: '25'
  }, {
    label: '103동',
    percentage: '25'
  }, {
    label: '외부 101동',
    percentage: '50'
  }]));
  expect(power.error).toBe(''); expect(power.allocations.map((a) => a.amount)).toEqual(['45665', '45665', '91330']);
});
test('나머지 외부 부담과 원 미만 나머지를 숨기지 않고 직접 조정을 요구', () => {
  const missing = calculateExpenseAllocation('182660', draft('RATIO', [{
    label: '102',
    percentage: '25'
  }, {
    label: '103',
    percentage: '25'
  }]));
  expect(missing.remaining.toString()).toBe('91330'); expect(missing.error).not.toBe('');
  const odd = calculateExpenseAllocation('101', draft('EQUAL', [{
    label: '102'
  }, {
    label: '103'
  }]));
  expect(odd.remaining.toString()).toBe('1'); expect(odd.error).toContain('원 미만');
  expect(calculateExpenseAllocation('101', draft('AMOUNT', [{
    label: '102',
    amount: '50'
  }, {
    label: '103',
    amount: '51'
  }])).error).toBe('');
});
test('큰 원 단위 금액·소수 비율의 정밀도와 중복 부담처 검증', () => {
  const result = calculateExpenseAllocation('999999999999900', draft('RATIO', [{
    label: 'a',
    percentage: '12.50'
  }, {
    label: 'b',
    percentage: '87.50'
  }]));
  expect(result.error).toContain('원 미만');
  expect(calculateExpenseAllocation('100', draft('AMOUNT', [{
    label: 'same',
    amount: '50'
  }, {
    label: 'same',
    amount: '50'
  }])).error).toContain('중복');
});

test('지출 XLSX는 두 동을 통합하고 선택 동·외부 제외·수식 이름과 큰 합계의 정밀도를 보존', async () => {
  const row = {
    date: '2026-10-15',
    time: '09:00:00',
    payer: '07전기요금',
    amount: '182660',
    expense: {
      category: '=전기료',
      allocations: [
        {
          buildingId: '102',
          label: '102동',
          amount: '45665'
        },
        {
          buildingId: '103',
          label: '103동',
          amount: '45665'
        },
        {
          buildingId: null,
          label: '101동',
          amount: '91330'
        }
      ]
    }
  } as BankingTransaction;
  async function workbook(rows: BankingTransaction[], buildingIds: string[]) {
    const blob = await createExpenseWorkbook(rows, buildingIds);
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const strings = [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]);
    const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']);
    const cells = Object.fromEntries([...sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)].map((match) => [match[1], match[2].includes('t="s"') ? strings[Number(match[3])] : match[3]]));
    return {
      sheet,
      cells
    };
  }
  const all = await workbook(Array.from({
    length: 12
  }, () => row), ['102', '103']);
  expect(all.cells.C9).toBe('91330');
  expect(all.cells.C21).toBe('1095960');
  expect(all.cells.B9).toBe('=전기료');
  expect(all.sheet).not.toContain('<f>');
  expect((all.sheet.match(/<row /g) ?? []).length).toBe(23);
  const single = await workbook([row], ['102']);
  expect(single.cells.C9).toBe('45665');
  const big = {
    ...row,
    amount: '999999999999999',
    expense: {
      ...row.expense!,
      allocations: [{
        buildingId: '102',
        label: '102동',
        amount: '999999999999999',
        percentage: null
      }]
    }
  };
  const large = await workbook(Array.from({
    length: 12
  }, () => big), ['102']);
  expect(large.cells.C21).toBe('11999999999999988');
});

test('수납 보고서는 부과·충당액을 보존하고 최근 입금자·선입금 열은 제외하며 재업로드 헤더를 유지', async () => {
  const { createMonthlyWorkbook } = await import('../src/widgets/payment-workspace/model/monthlyExport');
  const { createInputWorkbook } = await import('../src/shared/lib/excel-report');
  const blob = await createMonthlyWorkbook({
    propertyId: 'property',
    propertyName: '성내빌라',
    generatedAt: '2026-10-31T00:00:00Z',
    filters: {
      query: '',
      building: '',
      status: '전체'
    },
    month: '2026-10',
    ledger: {
      asOf: '2026-10-17',
      accounts: [],
      units: [{
        id: 'unit',
        label: '102동 401호',
        status: 'ACTIVE',
        representativeName: '=이름'
      }],
      charges: [{
        id: 'charge',
        unitId: 'unit',
        month: '2026-10',
        amount: '50000',
        status: 'ISSUED'
      }],
      payments: [{
        id: 'receipt',
        source: 'MANUAL',
        status: 'CONFIRMED',
        accountId: 'account',
        date: '2026-10-15',
        payer: '=이름',
        amount: '150000',
        unitId: 'unit',
        reason: '',
        allocations: []
      }],
      history: []
    },
  });
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('<v>50000</v>');expect(sheet).not.toContain('<v>100000</v>');
  expect(sheet).toContain('ySplit="9"');expect(sheet).not.toContain('<f>');
  const input = await createInputWorkbook({
    title: '모아홈 기존 잔액 인계',
    sheet: '기존 잔액 인계',
    columns: ['세대 ID', '세대', '기존 미납', '기존 선납', '발생월', '부담 주체 메모'].map((label) => ({
      label,
      width: 24
    })),
    rows: [['id', '001호', '10000', '0', '', '=메모']],
    instructions: ['첫 시트의 열 제목을 유지합니다.']
  });
  const inputZip = unzipSync(new Uint8Array(await input.arrayBuffer()));
  const first = strFromU8(inputZip['xl/worksheets/sheet1.xml']);
  expect(first).toContain('r="A1"');expect(first).toContain('r="F2"');expect(first).toContain('ySplit="1"');expect(first).not.toContain('<f>');
  expect(strFromU8(inputZip['xl/workbook.xml'])).toContain('작성 안내');
});

test('동별 잔고는 시작 잔고 미설정을 0원으로 합산하지 않고 월 거래만 누적', async () => {
  const { getBalanceSummary, getBuildingLedger } = await import('../src/widgets/banking-workspace/model/balanceLedger');
  const building = {
    id: '102',
    label: '102동',
    active: true,
    startBalance: '600000',
    income: '50000',
    expense: '45665',
    balance: '604335',
    status: 'READY' as const
  };
  const data = {
    buildings: [building],
    bankBalance: '900000',
    accounts: [{
      id: 'bank',
      calculatedBalance: '513005',
      calculationBasisDate: '2026-09-30'
    }],
    externals: [{
      remaining: '91330'
    }]
  } as unknown as import('../src/widgets/banking-workspace/api/bankingBalanceApiTypes').BalanceWorkspace;
  expect(getBalanceSummary(data)).toEqual({
    total: BigInt(604335),
    difference: BigInt(-91330),
    external: BigInt(91330)
  });
  expect(getBalanceSummary({
    ...data,
    externals: [{
      ...data.externals[0],
      excluded: true
    }]
  })).toEqual({
    total: BigInt(604335),
    difference: BigInt(-91330),
    external: BigInt(0)
  });
  expect(getBalanceSummary({
    ...data,
    buildings: [{
      ...building,
      balance: null,
      startBalance: null,
      status: 'OPENING_REQUIRED'
    }]
  }).total).toBeNull();
  const entries = [{
    id: 'out',
    buildingId: '102',
    date: '2026-10-15',
    time: '09:00:00',
    label: '전기료',
    income: '0',
    expense: '45665'
  }, {
    id: 'in',
    buildingId: '102',
    date: '2026-10-15',
    time: '08:00:00',
    label: '관리비',
    income: '50000',
    expense: '0'
  }, {
    id: 'old',
    buildingId: '102',
    date: '2026-09-01',
    time: null,
    label: '이전',
    income: '10000',
    expense: '0'
  }];
  expect(getBuildingLedger(building, entries, '2026-10').map((e) => e.balance)).toEqual([BigInt(650000), BigInt(604335)]);
  expect(entries[0].id).toBe('out');
});

test('통장 장부와 동별 차이는 수동 거래 반영 계산값을 사용하고 은행 확인값은 별도로 보존', async () => {
  const { getAccountBalanceDisplay, getAccountBalanceTotal } = await import('../src/widgets/banking-workspace/model/accountBalance');
  const { getBalanceSummary } = await import('../src/widgets/banking-workspace/model/balanceLedger');
  const account = {
    id: 'bank',
    label: '카카오뱅크',
    status: 'ACTIVE',
    balance: null,
    asOf: null,
    calculatedBalance: '1522910',
    calculationBasisDate: '2026-09-30'
  };
  expect(getAccountBalanceDisplay(account)).toMatchObject({
    amount: '1522910',
    calculated: true
  });
  expect(getAccountBalanceDisplay({
    ...account,
    balance: '1500000',
    asOf: '2026-10-15'
  })).toMatchObject({
    amount: '1522910',
    calculated: true
  });
  expect(getAccountBalanceDisplay({
    ...account,
    calculatedBalance: null
  })).toMatchObject({
    amount: null,
    calculated: false
  });
  const data = {
    buildings: [{
      balance: '1522910'
    }],
    bankBalance: null,
    accounts: [account],
    externals: []
  } as unknown as import('../src/widgets/banking-workspace/api/bankingBalanceApiTypes').BalanceWorkspace;
  expect(getBalanceSummary(data)).toMatchObject({
    total: BigInt(1522910),
    difference: BigInt(0)
  });
  const mixed = {
    ...data,
    accounts: [account, {
      ...account,
      id: 'shinhan',
      balance: '815204',
      asOf: '2026-10-15',
      calculatedBalance: '999999'
    }],
    buildings: [{
      ...data.buildings[0],
      balance: '2404832'
    }]
  };
  expect(getAccountBalanceTotal(mixed)).toEqual({
    amount: '2522909',
    calculated: true
  });
  expect(getBalanceSummary(mixed).difference).toBe(BigInt(118077));
  expect(mixed.bankBalance).toBeNull();
  expect(getAccountBalanceTotal({
    ...mixed,
    accountId: 'bank'
  }).amount).toBe('1522910');
  const missing = {
    ...mixed,
    accounts: [account, {
      ...account,
      id: 'unknown',
      calculatedBalance: null
    }]
  };
  expect(getAccountBalanceTotal(missing).amount).toBeNull();
  expect(getBalanceSummary(missing).difference).toBeNull();
  expect(getAccountBalanceDisplay({
    ...account,
    balance: '1500000',
    calculatedBalance: null
  })).toMatchObject({
    amount: '1500000',
    calculated: false,
    label: '마지막 확인 잔액'
  });
  expect(getAccountBalanceDisplay({
    ...account,
    confirmation: {
      source: 'MULTIPLE',
      sourceId: null,
      date: '2026-10-15',
      time: null,
      precision: 'DATE',
      status: 'ORDER_UNCLEAR'
    }
  }).amount).toBe('1522910');
  expect(getAccountBalanceTotal({
    ...data,
    accounts: [],
    bankBalance: '1500000'
  }).amount).toBeNull();
  expect(getBalanceSummary({
    ...mixed,
    buildings: [{
      ...mixed.buildings[0],
      balance: null
    }]
  }).difference).toBeNull();
});


test('사용 종료 통장은 사용 이력·조회 월로 필터링하고 사용 전 통장과 미사용 종료 통장을 제외', () => {
  const accounts = [
    {
      id: 'active',
      status: 'ACTIVE',
      availableFrom: '2026-09-30',
      hasHistory: false
    },
    {
      id: 'used',
      status: 'CLOSED',
      availableFrom: '2026-08-15',
      closedOn: '2026-10-23',
      hasHistory: true
    },
    {
      id: 'unused',
      status: 'CLOSED',
      availableFrom: '2026-10-01',
      closedOn: '2026-10-23',
      hasHistory: false
    },
    {
      id: 'legacy',
      status: 'CLOSED'
    }
  ].map((account) => ({
    ...account,
    bankName: '테스트은행',
    last4: '1234',
    alias: null,
    isPrimary: account.id === 'active'
  }));
  expect(getAccountsForMonth(accounts, '2026-07').map((account) => account.id)).toEqual(['legacy']);
  expect(getAccountsForMonth(accounts, '2026-08').map((account) => account.id)).toEqual(['used', 'legacy']);
  expect(getAccountsForMonth(accounts, '2026-10').map((account) => account.id)).toEqual(['active', 'used', 'legacy']);
  expect(getAccountsForMonth(accounts, '2026-11').map((account) => account.id)).toEqual(['active', 'legacy']);
  expect(accounts.map((account) => account.id)).toEqual(['active', 'used', 'unused', 'legacy']);
});


test('통장별 보유금 비교는 해당 통장의 동별 몫만 합산하고 미설정·선택 범위를 구분', async () => {
  const { getAccountBuildingBalance, getBalancePeriodLabel } = await import('../src/widgets/banking-workspace/model/accountBalance');
  const data = {
    accounts: [{
      id: 'a'
    }, {
      id: 'b'
    }],
    buildings: [{
      active: true,
      balance: '170',
      accountBalances: [{
        accountId: 'a',
        balance: '100'
      }, {
        accountId: 'b',
        balance: '70'
      }]
    }, {
      active: true,
      balance: '280',
      accountBalances: [{
        accountId: 'a',
        balance: '200'
      }, {
        accountId: 'b',
        balance: '80'
      }]
    }]
  } as unknown as import('../src/widgets/banking-workspace/api/bankingBalanceApiTypes').BalanceWorkspace;
  expect(getAccountBuildingBalance(data, 'a')).toBe('300');
  expect(getAccountBuildingBalance(data, 'b')).toBe('150');
  expect(getAccountBuildingBalance({
    ...data,
    accountId: 'a',
    buildings: data.buildings.map((row) => ({
      ...row,
      balance: '20'
    }))
  }, 'a')).toBe('40');
  data.buildings[1].accountBalances![0].balance = null;
  expect(getAccountBuildingBalance(data, 'a')).toBeNull();
  expect(getAccountBuildingBalance(data, 'b')).toBe('150');
  expect(getAccountBuildingBalance({
    ...data,
    buildings: []
  }, 'a')).toBeNull();
  expect(getBalancePeriodLabel('2026-11')).toBe('2026년 11월 등록 내역 기준');
});

test('시작 금액을 다시 요구하지 않고 기존 확인 잔액을 상세·합계에 유지하며 없는 값만 확인 필요로 구분', async () => {
  const { getAccountBalanceDisplay, getAccountBalanceTotal } = await import('../src/widgets/banking-workspace/model/accountBalance');
  const account = {
    id: 'bank',
    label: '통장',
    status: 'ACTIVE',
    balance: '514614',
    asOf: '2026-10-31 14:22',
    calculatedBalance: null
  };
  expect(getAccountBalanceDisplay(account)).toMatchObject({
    amount: '514614',
    calculated: false,
    label: '마지막 확인 잔액'
  });
  const data = {
    accounts: [account],
    accountId: null
  } as unknown as import('../src/widgets/banking-workspace/api/bankingBalanceApiTypes').BalanceWorkspace;
  expect(getAccountBalanceTotal(data)).toEqual({
    amount: '514614',
    calculated: false
  });
  expect(getAccountBalanceDisplay({
    ...account,
    balance: null
  }).amount).toBeNull();
});

test('업무 검토 기간은 실제 거래일이며 중복 의심은 은행 원본과 대응하는 수동 후보만 반환', async () => {
  const { getBankingDuplicateIds, getBankingReviewRange } = await import('../src/widgets/banking-workspace/model/bankingReview');
  const original = {
    id: 'bank',
    sourceType: 'BANK_IMPORT',
    accountId: 'account',
    date: '2026-10-15',
    amount: '50000',
    direction: 'INCOME',
    status: 'CONFIRMED'
  } as import('../src/widgets/banking-workspace/api/bankingApiTypes').BankingTransaction;
  const manual = {
    ...original,
    id: 'receipt:manual',
    sourceType: undefined
  };
  const canceled = {
    ...manual,
    id: 'receipt:canceled',
    status: 'CANCELED'
  };
  expect([...getBankingDuplicateIds([original, manual, canceled], '2026-11-01')]).toEqual(['receipt:manual']);
  expect(getBankingReviewRange([original], '2026-11-01')).toEqual({
    startDate: '2026-10-15',
    endDate: '2026-11-01'
  });
  expect(getBankingReviewRange([], '2026-11-01')).toEqual({
    startDate: '2026-11-01',
    endDate: '2026-11-01'
  });
});
