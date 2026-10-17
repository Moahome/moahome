import {
  strFromU8,
  unzipSync
} from 'fflate';
import { createExpenseWorkbook } from '../src/widgets/banking-workspace/model/expenseExport';
import {
  expect,
  test
} from '@playwright/test';
import {
  calculateExpenseAllocation,
  createExpenseDraft
} from '../src/widgets/banking-workspace/model/expenseAllocation';
import type {
  BankingTransaction,
  BankingWorkspaceData,
  ExpenseDraft
} from '../src/widgets/banking-workspace/api/bankingApi';

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

test('공통 엑셀 서식은 수납 금액·선입금을 보존하고 재업로드 헤더를 첫 행에 유지', async () => {
  const { createMonthlyWorkbook } = await import('../src/widgets/payment-workspace/model/monthlyExport');
  const { createInputWorkbook } = await import('../src/shared/lib/excel-report');
  const blob = await createMonthlyWorkbook({
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
  }, '2026-10');
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('<v>50000</v>');expect(sheet).toContain('<v>100000</v>');
  expect(sheet).toContain('ySplit="8"');expect(sheet).not.toContain('<f>');
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
    bankBalance: '513005',
    externals: [{
      remaining: '91330'
    }]
  } as unknown as import('../src/widgets/banking-workspace/api/bankingBalanceApi').BalanceWorkspace;
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
  const { createBalanceWorkbook } = await import('../src/widgets/banking-workspace/model/balanceLedger');
  const exported = await createBalanceWorkbook({
    ...data,
    month: '2026-10',
    cutoffDate: '2026-09-30',
    entries
  }, [building]);
  const zip = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  expect(strFromU8(zip['xl/workbook.xml'])).toContain('원장 1');
  expect(strFromU8(zip['xl/worksheets/sheet2.xml'])).toContain('<v>604335</v>');
  expect(strFromU8(zip['xl/sharedStrings.xml'])).not.toContain('<t>이전</t>');
});
