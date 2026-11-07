import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  createMonthlyReportWorkbook,
  getMonthlyReportDocuments
} from '../src/screens/accounting/settlement/model/monthlyReport';
import {
  getSettlementReport,
  filterSettlementAccounts,
  filterSettlementBuildings,
  filterSettlementExternal
} from '../src/screens/accounting/settlement/model/monthlySettlement';
import {
  settlementFixture,
  settlementDetailFixture,
  settlementId
} from './support/monthlySettlement';

test('실제 입출금·이월 충당·동별 부담·외부 미회수를 분리하고 연결·취소 수동 입금은 중복 합산하지 않음', () => {
  const report = getSettlementReport(settlementFixture());
  expect(report.bankIncome).toBe(BigInt(47000));
  expect(report.bankExpense).toBe(BigInt(27000));
  expect(report.householdIncome).toBe(BigInt(40000));
  expect(report.billed).toBe(BigInt(50000));
  expect(report.applied).toBe(BigInt(10000));
  expect(report.receivable).toBe(BigInt(40000));
  expect(report.buildingBalance).toBe(BigInt(128000));
  expect(report.outstanding).toBe(BigInt(6000));
  expect(report.cash).toHaveLength(5);
  expect(report.checks.find((row) => row.id === 'external')?.count).toBe(1);
});

test('인계 선납은 청구 잔여액에만 반영하고 0원·음수 정산과 미확인 잔액은 확정 금액으로 바꾸지 않음', () => {
  const data = settlementFixture();
  data.payments.openingCredits = [{
    id: settlementId(80),
    unitId: settlementId(4),
    date: '2026-09-30',
    amount: '5000',
    allocations: []
  }];
  const credit = getSettlementReport(data);
  expect(credit.bankIncome).toBe(BigInt(47000));
  expect(credit.receivable).toBe(BigInt(35000));
  data.payments.charges.push({
    id: settlementId(81),
    unitId: settlementId(4),
    month: '2026-10',
    status: 'ISSUED',
    amount: '-1000'
  });
  data.balances.buildings[0].balance = null;
  data.balances.accounts![0].balance = null;
  const pending = getSettlementReport(data);
  expect(pending.billed).toBe(BigInt(49000));
  expect(pending.receivable).toBeNull();
  expect(pending.buildingBalance).toBeNull();
  expect(pending.accounts[0].balance).toBe('120000');
});

test('은행 확인 금액·시각·순서 상태는 정산 장부값과 확인 필요 건수를 바꾸지 않음', () => {
  const data = settlementFixture();
  const row = data.balances.accounts![0];
  for (const state of ['READY', 'ORDER_UNCLEAR', 'BALANCE_MISSING'] as const) {
    row.balance = '999999';
    row.confirmation!.date = '2026-11-30';
    row.confirmation!.status = state;
    row.confirmation!.precision = 'TIME';
    const report = getSettlementReport(data);
    expect(report.accounts[0].balance).toBe('120000');
    expect(report.buildingBalance).toBe(BigInt(128000));
    expect(report.checks.find((check) => check.id === 'accounts')?.count).toBe(0);
    expect(report.outstanding).toBe(BigInt(6000));
    const document = getMonthlyReportDocuments(data)[2];
    expect(document.columns[1].label).toBe('장부 잔액');
    expect(document.rows[0][1]).toBe(BigInt(120000));
  }
  row.calculatedBalance = null;
  const missing = getSettlementReport(data);
  expect(missing.accounts[0].balance).toBeNull();
  expect(missing.checks.find((check) => check.id === 'accounts')?.count).toBe(1);
  expect(getMonthlyReportDocuments(data)[2].rows[0][1]).toBe('확인 필요');
});

test('동은 숫자 오름차순, 외부 부담금은 지출일 최신순으로 원천을 변경하지 않고 정렬하고 회수 상태를 구분', () => {
  const data = settlementDetailFixture();
  const before = JSON.stringify(data);
  const report = getSettlementReport(data);
  expect(report.buildings.map((row) => row.label)).toEqual(['2동', '10동', '102동', '103동']);
  expect(report.external.map((row) => [row.date, row.recoveryStatus])).toEqual([
    ['2026-10-20', '회수 완료'], ['2026-10-16', '회수 필요'], ['2026-10-15', '일부 회수'], ['2026-10-14', '정산 제외']
  ]);
  expect(report.outstanding).toBe(BigInt(14000));
  expect(JSON.stringify(data)).toBe(before);
});

test('통장 검색은 은행 비교 상태와 무관하며 동별 설정 누락은 그대로 구분', () => {
  const report = getSettlementReport(settlementDetailFixture());
  expect(filterSettlementAccounts(report.accounts, ' 카카오 ').map((row) => row.id)).toEqual([settlementId(201)]);
  expect(filterSettlementAccounts(report.accounts, '없는통장')).toHaveLength(0);
  expect(filterSettlementBuildings(report.buildings, '', '설정 필요').map((row) => row.label)).toEqual(['103동']);
  expect(filterSettlementBuildings(report.buildings, '103', '설정됨')).toHaveLength(0);
});

test('미회수 전체는 일부 회수를 포함하고 정산 제외·회수 완료를 제외하며 검색과 결합', () => {
  const report = getSettlementReport(settlementDetailFixture());
  expect(filterSettlementExternal(report.external, '', '미회수 전체').map((row) => row.label)).toEqual(['외부 D', '외부 A']);
  expect(filterSettlementExternal(report.external, '수도', '회수 필요').map((row) => row.label)).toEqual(['외부 D']);
  expect(filterSettlementExternal(report.external, '전기', '회수 완료').map((row) => row.label)).toEqual(['외부 C']);
  expect(filterSettlementExternal(report.external, '', '정산 제외').map((row) => row.label)).toEqual(['외부 B']);
});

test('외부 부담금은 지출월로 한정하고 이전·다음 월의 회수 필요액과 제외 내역을 목록·합계·점검에 섞지 않음', () => {
  const data = settlementFixture();
  const original = data.balances.externals[0];
  data.balances.externals.push(
    {
      ...original,
      id: settlementId(801),
      date: '2026-09-30',
      label: '이전 월 미회수',
      remaining: '8000',
      received: '0'
    },
    {
      ...original,
      id: settlementId(802),
      date: '2026-11-01',
      label: '다음 월 미회수',
      remaining: '8000',
      received: '0'
    },
    {
      ...original,
      id: settlementId(803),
      date: '2026-10-01',
      label: '월초 부담',
      remaining: '8000',
      received: '0'
    },
    {
      ...original,
      id: settlementId(804),
      date: '2026-10-31',
      label: '월말 부담',
      remaining: '8000',
      received: '0'
    }
  );
  const before = JSON.stringify(data);
  const report = getSettlementReport(data);
  expect(report.external.map((row) => row.label)).toEqual(['월말 부담', '외부 A', '외부 B', '월초 부담']);
  expect(report.outstanding).toBe(BigInt(22000));
  expect(report.checks.find((row) => row.id === 'external')?.count).toBe(3);
  data.month = '2026-09';
  expect(getSettlementReport(data).external.map((row) => row.label)).toEqual(['이전 월 미회수']);
  data.month = '2026-10';
  expect(JSON.stringify(data)).toBe(before);
});


test('월별 종합보고서는 원본 통장 금액·동별 부담액·청구 충당을 분리하고 다른 달 외부 부담금을 출력하지 않음', async () => {
  const data = settlementDetailFixture();
  data.balances.externals.push({
    ...data.balances.externals[0],
    id: settlementId(810),
    date: '2026-09-30',
    label: '지난달 외부 부담',
    remaining: '90000'
  });
  const documents = getMonthlyReportDocuments(data);
  expect(documents).toHaveLength(7);
  expect(documents[0].rows).toHaveLength(8);
  expect(documents[1].rows).toHaveLength(6);
  expect(documents[0].rows[7][1]).toBe(BigInt(14000));
  expect(documents[6].rows.map((row) => row[0])).toEqual(['2026-10-20', '2026-10-16', '2026-10-15', '2026-10-14']);
  expect(documents[6].total).toEqual(['합계', '', '', BigInt(24000), BigInt(10000), BigInt(14000), '']);
  expect(documents[3].rows.map((row) => row[0])).toEqual(['2동', '10동', '102동', '103동']);
  expect(documents[3].rows[3][4]).toBe('확인 필요');
  expect(documents[5].total?.slice(3, 5)).toEqual([BigInt(47000), BigInt(27000)]);
  const workbook = await createMonthlyReportWorkbook(data);
  const files = unzipSync(new Uint8Array(await workbook.arrayBuffer()));
  const sheets = strFromU8(files['xl/workbook.xml']);
  expect([...sheets.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map((match) => match[1])).toEqual([
    '종합 요약', '월말 점검', '통장별 잔액', '동별 자금', '수납과 미납', '입출금 명세', '외부 부담금'
  ]);
  expect(Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))).toHaveLength(7);
  for (const [index, document] of documents.entries()) {
    const sheet = strFromU8(files[`xl/worksheets/sheet${index + 1}.xml`]);
    expect(sheet).toContain('ySplit="5"');
    for (const row of [...document.rows, ...(document.total ? [document.total] : [])]) {
      for (const value of row) {
        if (typeof value === 'bigint') expect(sheet).toContain(`<v>${value}</v>`);
      }
    }
  }
  const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  for (const title of ['월별 정산 종합보고서', '월말 점검', '통장별 잔액', '동별 보유금 현황', '수납과 미납', '통장 입출금 명세', '외부 부담금']) expect(xml).toContain(title);
  expect(xml).not.toContain('지난달 외부 부담');
  expect(xml).not.toContain('마감 미확정');
  expect(xml).toContain('확인 필요');
});

test('자동 이체는 양쪽 통장 이동을 표시하고 취소하면 양쪽 현금 합계와 확인 대상에서 함께 제외', () => {
  const data = settlementFixture();
  const before = getSettlementReport(data);
  const source = {
    ...data.banking.rows[0],
    id: settlementId(990),
    amount: '10000',
    direction: 'EXPENSE' as const,
    expense: null,
    paymentId: null,
    status: 'TRANSFER',
    transferCandidate: true,
    automaticTransfer: true,
    transferId: settlementId(992)
  };
  const counterpart = {
    ...source,
    id: settlementId(991),
    direction: 'INCOME' as const,
    sourceType: 'TRANSFER_AUTO' as const,
    balance: null
  };
  data.banking.rows.push(source, counterpart);
  const active = getSettlementReport(data);
  expect(active.bankIncome).toBe(before.bankIncome + BigInt(10000));
  expect(active.bankExpense).toBe(before.bankExpense + BigInt(10000));
  expect(active.cash.find((row) => row.id === counterpart.id)?.source).toBe('이체 자동 반영');
  source.status = 'CANCELED';
  counterpart.status = 'CANCELED';
  const canceled = getSettlementReport(data);
  expect(canceled.bankIncome).toBe(before.bankIncome);
  expect(canceled.bankExpense).toBe(before.bankExpense);
  expect(canceled.checks).toEqual(before.checks);
});


test('수동 이체는 양쪽 현금에 한 번 표시하고 은행 원본·중복 수납으로 오인하지 않으며 취소하면 함께 제외', () => {
  const data = settlementFixture();
  const before = getSettlementReport(data);
  const manual = data.payments.payments.find((row) => row.source === 'MANUAL' && row.status === 'CONFIRMED' && !row.bankTransactionId)!;
  const template = data.banking.rows[0];
  const incoming = {
    ...template,
    id: settlementId(950),
    date: manual.date,
    accountId: manual.accountId,
    sourceType: 'TRANSFER_MANUAL' as const,
    transferId: settlementId(951),
    automaticTransfer: true,
    status: 'TRANSFER' as 'TRANSFER' | 'CANCELED',
    direction: 'INCOME' as const,
    amount: manual.amount,
    expense: null
  };
  const outgoing = {
    ...incoming,
    id: settlementId(952),
    accountId: settlementId(953),
    direction: 'EXPENSE' as const
  };
  data.banking.rows.push(incoming, outgoing);
  const report = getSettlementReport(data);
  expect(report.bankIncome).toBe(before.bankIncome + BigInt(manual.amount));
  expect(report.bankExpense).toBe(before.bankExpense + BigInt(manual.amount));
  expect(report.householdIncome).toBe(before.householdIncome);
  expect(report.cash.filter((row) => [incoming.id, outgoing.id].includes(row.id)).map((row) => row.source)).toEqual(['수동 이체', '수동 이체']);
  expect(report.checks.find((row) => row.id === 'manual')?.count).toBe(before.checks.find((row) => row.id === 'manual')?.count);
  incoming.status = 'CANCELED';
  outgoing.status = 'CANCELED';
  const canceled = getSettlementReport(data);
  expect(canceled.bankIncome).toBe(before.bankIncome);
  expect(canceled.bankExpense).toBe(before.bankExpense);
});
