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
} from '../src/screens/monthly-settlement/model/monthlyReport';
import {
  getSettlementReport,
  filterSettlementAccounts,
  filterSettlementBuildings,
  filterSettlementExternal
} from '../src/screens/monthly-settlement/model/monthlySettlement';
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
  expect(report.applied).toBe(BigInt(40000));
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
  expect(pending.accounts[0].difference).toBeNull();
});

test('동일 월말의 일 마감 확인값에만 차액을 계산하고 시각 자료·순서 미확인은 비교 불가로 유지', () => {
  const data = settlementFixture();
  expect(getSettlementReport(data).accounts[0].difference).toBe(BigInt(0));
  data.balances.accounts![0].balance = '120500';
  expect(getSettlementReport(data).accounts[0].difference).toBe(BigInt(500));
  data.balances.accounts![0].confirmation!.date = '2026-10-30';
  expect(getSettlementReport(data).accounts[0].difference).toBeNull();
  data.balances.accounts![0].confirmation!.date = '2026-10-31';
  data.balances.accounts![0].confirmation!.precision = 'TIME';
  expect(getSettlementReport(data).accounts[0].difference).toBeNull();
  data.balances.accounts![0].confirmation!.precision = 'DAY_END';
  data.balances.accounts![0].confirmation!.status = 'ORDER_UNCLEAR';
  expect(getSettlementReport(data).accounts[0].difference).toBeNull();
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

test('통장·동 검색과 자료 부족 필터는 미확인 잔액을 0원 또는 차액 없음으로 분류하지 않음', () => {
  const report = getSettlementReport(settlementDetailFixture());
  expect(filterSettlementAccounts(report.accounts, ' 카카오 ', '차액 있음').map((row) => row.id)).toEqual([settlementId(201)]);
  expect(filterSettlementAccounts(report.accounts, '', '비교 자료 필요').map((row) => row.id)).toEqual([settlementId(202)]);
  expect(filterSettlementAccounts(report.accounts, '국민', '차액 없음')).toHaveLength(0);
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
  expect(sheets.match(/<sheet /g)).toHaveLength(1);
  const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  for (const title of ['월별 정산 종합보고서', '월말 점검', '통장별 잔액', '동별 보유금 현황', '수납과 미납', '통장 입출금 명세', '외부 부담금']) expect(xml).toContain(title);
  expect(xml).not.toContain('지난달 외부 부담');
  expect(xml).not.toContain('마감 미확정');
  expect(xml).toContain('확인 필요');
});
