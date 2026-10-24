import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  getSettlementReport,
  filterSettlementAccounts,
  filterSettlementBuildings,
  filterSettlementExternal
} from '../src/screens/monthly-settlement/model/monthlySettlement';
import {
  createSettlementWorkbook,
  getSettlementDocument,
  getSettlementBuildingOptions,
  getSettlementAccountOptions,
  getSettlementPeriodLabel
} from '../src/screens/monthly-settlement/model/settlementExport';
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

test('다운로드는 한 시트에 동별 실제 입금·부담 지출만 담고 별도 수납·통장·회수 시트는 만들지 않음', async () => {
  const data = settlementFixture();
  const document = getSettlementDocument(data);
  expect(document.rows.map((row) => row[4])).toEqual(['102동 101호 관리비', '전기요금 부담', '동별 기타 입금', '']);
  expect(document.total).toEqual(['전체 합계', '', '', '', '', BigInt(40000), BigInt(12000), BigInt(128000)]);
  const blob = await createSettlementWorkbook(data);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const workbook = strFromU8(files['xl/workbook.xml']);
  expect(workbook.match(/<sheet /g)).toHaveLength(1);
  expect(workbook).toContain('동별 입출금 내역');
  const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('102동 101호 관리비');
  expect(xml).toContain('102동 소계');
  expect(xml).toContain('12000');
  expect(xml).not.toContain('외부 A');
  expect(xml).not.toContain('월말 점검');
});

test('동별 입출금은 선택 월·숫자 동 순서·오래된 거래 순서를 지키고 미분류 통장 이동을 임의 배분하지 않음', () => {
  const data = settlementDetailFixture();
  data.balances.entries.push({
    id: settlementId(210),
    buildingId: settlementId(203),
    date: '2026-10-20',
    time: null,
    label: '103동 청소비',
    income: '0',
    expense: '6000'
  },
  {
    id: settlementId(211),
    buildingId: settlementId(203),
    date: '2026-09-20',
    time: null,
    label: '과거 지출',
    income: '0',
    expense: '99999'
  });
  const before = JSON.stringify(data);
  const document = getSettlementDocument(data);
  expect(document.rows.filter((row) => row[3] === '동별 합계').map((row) => row[0])).toEqual(['2동', '10동', '102동', '103동']);
  expect(document.rows.some((row) => row[4] === '과거 지출')).toBe(false);
  expect(document.rows.some((row) => row[4] === '거래 내용')).toBe(false);
  expect(document.total?.slice(5, 7)).toEqual([BigInt(40000), BigInt(18000)]);
  expect(JSON.stringify(data)).toBe(before);
});

test('동은 숫자 오름차순, 외부 부담금은 지출일 최신순으로 원천을 변경하지 않고 정렬하고 회수 상태를 구분', () => {
  const data = settlementDetailFixture();
  const before = JSON.stringify(data);
  const report = getSettlementReport(data);
  expect(report.buildings.map((row) => row.label)).toEqual(['2동', '10동', '102동', '103동']);
  expect(report.external.map((row) => [row.date, row.recoveryStatus])).toEqual([
    ['2026-10-20', '회수 완료'], ['2026-10-16', '회수 필요'], ['2026-10-15', '일부 회수'], ['2026-09-15', '정산 제외']
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

test('다운로드 동 선택은 해당 동의 거래·소계·합계만 남기고 전체 동으로 되돌리면 원래 범위를 복원', async () => {
  const data = settlementDetailFixture();
  data.balances.entries.push({
    id: settlementId(910),
    buildingId: settlementId(203),
    date: '2026-10-20',
    time: null,
    label: '103동 청소비',
    income: '0',
    expense: '6000'
  });
  const before = JSON.stringify(data);
  expect(getSettlementBuildingOptions(data).map((row) => row.label)).toEqual(['2동', '10동', '102동', '103동']);
  const selected = getSettlementDocument(data, settlementId(203));
  expect(selected.rows.every((row) => row[0] === '103동')).toBe(true);
  expect(selected.rows.map((row) => row[4])).toEqual(['103동 청소비', '']);
  expect(selected.total?.slice(5, 7)).toEqual([BigInt(0), BigInt(6000)]);
  expect(selected.summary.find((item) => item.label === '조회 동')?.value).toBe('103동');
  const empty = getSettlementDocument(data, settlementId(204));
  expect(empty.rows.map((row) => row[3])).toEqual(['내역 없음', '동별 합계']);
  expect(empty.total?.slice(5, 7)).toEqual([BigInt(0), BigInt(0)]);
  const workbook = unzipSync(new Uint8Array(await (await createSettlementWorkbook(data, settlementId(203))).arrayBuffer()));
  const xml = Object.entries(workbook).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('103동 청소비');
  expect(xml).not.toContain('102동 101호 관리비');
  expect(strFromU8(workbook['xl/workbook.xml']).match(/<sheet /g)).toHaveLength(1);
  expect(getSettlementDocument(data).total?.slice(5, 7)).toEqual([BigInt(40000), BigInt(18000)]);
  expect(() => getSettlementDocument(data, settlementId(999))).toThrow('INVALID_SETTLEMENT_BUILDING');
  expect(JSON.stringify(data)).toBe(before);
});

test('계좌 필터와 동 필터를 함께 적용해 선택 계좌의 실제 이동만 집계하고 미확인·잘못된 계좌를 전체로 넓히지 않음', () => {
  const data = settlementDetailFixture();
  data.balances.entries.push(
    {
      id: settlementId(920),
      buildingId: settlementId(203),
      accountId: settlementId(201),
      date: '2026-10-20',
      time: null,
      label: '103동 카카오 입금',
      income: '9000',
      expense: '0'
    },
    {
      id: settlementId(921),
      buildingId: settlementId(203),
      accountId: settlementId(2),
      date: '2026-10-20',
      time: null,
      label: '103동 하나 지출',
      income: '0',
      expense: '6000'
    },
    {
      id: settlementId(922),
      buildingId: settlementId(3),
      date: '2026-10-21',
      time: null,
      label: '과거 미확인 계좌',
      income: '1000',
      expense: '0'
    }
  );
  expect(getSettlementAccountOptions(data).some((row) => row.id === 'UNASSIGNED')).toBe(false);
  const selected = getSettlementDocument(data, settlementId(203), settlementId(201));
  expect(selected.rows.map((row) => row[4])).toEqual(['103동 카카오 입금', '']);
  expect(selected.total?.slice(5, 7)).toEqual([BigInt(9000), BigInt(0)]);
  expect(selected.summary.find((row) => row.label === '조회 계좌')?.value).toBe('카카오뱅크 ····1004');
  expect(getSettlementDocument(data, '', settlementId(201)).total?.slice(5, 7)).toEqual([BigInt(9000), BigInt(0)]);
  expect(getSettlementDocument(data, settlementId(203), settlementId(2)).total?.slice(5, 7)).toEqual([BigInt(0), BigInt(6000)]);
  expect(getSettlementDocument(data, settlementId(3), settlementId(201)).total?.slice(5, 7)).toEqual([BigInt(0), BigInt(0)]);
  expect(() => getSettlementDocument(data, '', 'UNASSIGNED')).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getSettlementDocument(data).rows.some((row) => row[4] === '과거 미확인 계좌')).toBe(true);
  expect(() => getSettlementDocument(data, '', settlementId(999))).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getSettlementDocument(data).total?.slice(5, 7)).toEqual([BigInt(50000), BigInt(18000)]);
});

test('숨겨진 계좌는 과거 수납 목록·원장에 남아 있어도 다운로드 필터에서 다시 생성하지 않음', () => {
  const data = settlementFixture();
  const hiddenId = settlementId(930);
  data.payments.accounts.push({
    id: hiddenId,
    label: '숨겨진 예전 통장'
  });
  data.balances.entries.push({
    id: settlementId(931),
    buildingId: settlementId(3),
    accountId: hiddenId,
    date: '2026-10-20',
    time: null,
    label: '과거 확정 이동',
    income: '1000',
    expense: '0'
  });
  expect(getSettlementAccountOptions(data).map((row) => row.id)).toEqual([settlementId(2)]);
  expect(() => getSettlementDocument(data, '', hiddenId)).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getSettlementDocument(data).rows.some((row) => row[4] === '과거 확정 이동')).toBe(true);
  data.banking.accounts = [];
  expect(getSettlementAccountOptions(data)).toEqual([]);
});

test('다운로드 계좌는 시작 월 전에는 숨기고 입출금 없는 당월 종료를 제외하며 사용한 종료 통장은 종료 월까지만 표시', () => {
  const data = settlementFixture();
  data.banking.accounts = [
    {
      ...data.banking.accounts![0],
      id: settlementId(940),
      availableFrom: '2026-10-01',
      hasHistory: false
    },
    {
      ...data.banking.accounts![0],
      id: settlementId(941),
      availableFrom: '2026-10-01',
      closedOn: '2026-10-24',
      status: 'CLOSED',
      hasHistory: false
    },
    {
      ...data.banking.accounts![0],
      id: settlementId(942),
      availableFrom: '2026-10-01',
      closedOn: '2026-10-24',
      status: 'CLOSED',
      hasHistory: true
    }
  ];
  data.month = '2026-09';
  expect(getSettlementAccountOptions(data)).toEqual([]);
  data.month = '2026-10';
  expect(getSettlementAccountOptions(data).map((row) => row.id)).toEqual([settlementId(940), settlementId(942)]);
  data.month = '2026-11';
  expect(getSettlementAccountOptions(data).map((row) => row.id)).toEqual([settlementId(940)]);
});


test('월초부터 월말 순서대로 잔액을 누적하며 개별 계좌에는 그 계좌의 기초·월말 잔액만 사용', () => {
  const data = settlementFixture();
  const document = getSettlementDocument(data);
  expect(document.rows.slice(0, 3).map((row) => row[7])).toEqual([BigInt(130000), BigInt(118000), BigInt(128000)]);
  data.balances.buildings[0].accountBalances = [{
    accountId: settlementId(2),
    startBalance: '50000',
    balance: '78000'
  }];
  const account = getSettlementDocument(data, settlementId(3), settlementId(2));
  expect(account.rows.slice(0, 3).map((row) => row[7])).toEqual([BigInt(80000), BigInt(68000), BigInt(78000)]);
  expect(account.summary.find((row) => row.label === '기초 잔액')?.value).toBe(BigInt(50000));
  expect(account.total?.[7]).toBe(BigInt(78000));
  data.balances.buildings[0].accountBalances[0].startBalance = null;
  data.balances.buildings[0].accountBalances[0].balance = null;
  expect(getSettlementDocument(data, '', settlementId(2)).rows[0][7]).toBe('설정 필요');
  data.month = '2026-09';
  expect(getSettlementPeriodLabel(data)).toBe('9월 마감');
  data.month = '2026-10';
  expect(getSettlementPeriodLabel(data)).toBe('집계 중');
});
