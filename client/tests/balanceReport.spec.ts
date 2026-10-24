import { getReportPeriodLabel } from '../src/shared/lib/pdf-report';
import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  createBalanceReportWorkbook,
  getBalanceReportDocument,
  getBalanceReportBuildingOptions,
  getBalanceReportAccountOptions
} from '../src/widgets/banking-workspace/model/balanceReport';
import {
  settlementFixture,
  settlementDetailFixture,
  settlementId
} from './support/monthlySettlement';

test('다운로드는 한 시트에 동별 실제 입금·부담 지출만 담고 별도 수납·통장·회수 시트는 만들지 않음', async () => {
  const data = settlementFixture();
  const document = getBalanceReportDocument(data);
  expect(document.rows.map((row) => row[4])).toEqual(['102동 101호 관리비', '전기요금 부담', '동별 기타 입금', '']);
  expect(document.total).toEqual(['전체 합계', '', '', '', '', BigInt(40000), BigInt(12000), BigInt(128000)]);
  const blob = await createBalanceReportWorkbook(data);
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
  const document = getBalanceReportDocument(data);
  expect(document.rows.filter((row) => row[3] === '동별 합계').map((row) => row[0])).toEqual(['2동', '10동', '102동', '103동']);
  expect(document.rows.some((row) => row[4] === '과거 지출')).toBe(false);
  expect(document.rows.some((row) => row[4] === '거래 내용')).toBe(false);
  expect(document.total?.slice(5, 7)).toEqual([BigInt(40000), BigInt(18000)]);
  expect(JSON.stringify(data)).toBe(before);
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
  expect(getBalanceReportBuildingOptions(data).map((row) => row.label)).toEqual(['2동', '10동', '102동', '103동']);
  const selected = getBalanceReportDocument(data, settlementId(203));
  expect(selected.rows.every((row) => row[0] === '103동')).toBe(true);
  expect(selected.rows.map((row) => row[4])).toEqual(['103동 청소비', '']);
  expect(selected.total?.slice(5, 7)).toEqual([BigInt(0), BigInt(6000)]);
  expect(selected.summary.find((item) => item.label === '조회 동')?.value).toBe('103동');
  const empty = getBalanceReportDocument(data, settlementId(204));
  expect(empty.rows.map((row) => row[3])).toEqual(['내역 없음', '동별 합계']);
  expect(empty.total?.slice(5, 7)).toEqual([BigInt(0), BigInt(0)]);
  const workbook = unzipSync(new Uint8Array(await (await createBalanceReportWorkbook(data, settlementId(203))).arrayBuffer()));
  const xml = Object.entries(workbook).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('103동 청소비');
  expect(xml).not.toContain('102동 101호 관리비');
  expect(strFromU8(workbook['xl/workbook.xml']).match(/<sheet /g)).toHaveLength(1);
  expect(getBalanceReportDocument(data).total?.slice(5, 7)).toEqual([BigInt(40000), BigInt(18000)]);
  expect(() => getBalanceReportDocument(data, settlementId(999))).toThrow('INVALID_SETTLEMENT_BUILDING');
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
  expect(getBalanceReportAccountOptions(data).some((row) => row.id === 'UNASSIGNED')).toBe(false);
  const selected = getBalanceReportDocument(data, settlementId(203), settlementId(201));
  expect(selected.rows.map((row) => row[4])).toEqual(['103동 카카오 입금', '']);
  expect(selected.total?.slice(5, 7)).toEqual([BigInt(9000), BigInt(0)]);
  expect(selected.summary.find((row) => row.label === '조회 계좌')?.value).toBe('카카오뱅크 ····1004');
  expect(getBalanceReportDocument(data, '', settlementId(201)).total?.slice(5, 7)).toEqual([BigInt(9000), BigInt(0)]);
  expect(getBalanceReportDocument(data, settlementId(203), settlementId(2)).total?.slice(5, 7)).toEqual([BigInt(0), BigInt(6000)]);
  expect(getBalanceReportDocument(data, settlementId(3), settlementId(201)).total?.slice(5, 7)).toEqual([BigInt(0), BigInt(0)]);
  expect(() => getBalanceReportDocument(data, '', 'UNASSIGNED')).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getBalanceReportDocument(data).rows.some((row) => row[4] === '과거 미확인 계좌')).toBe(true);
  expect(() => getBalanceReportDocument(data, '', settlementId(999))).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getBalanceReportDocument(data).total?.slice(5, 7)).toEqual([BigInt(50000), BigInt(18000)]);
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
  expect(getBalanceReportAccountOptions(data).map((row) => row.id)).toEqual([settlementId(2)]);
  expect(() => getBalanceReportDocument(data, '', hiddenId)).toThrow('INVALID_SETTLEMENT_ACCOUNT');
  expect(getBalanceReportDocument(data).rows.some((row) => row[4] === '과거 확정 이동')).toBe(true);
  data.banking.accounts = [];
  expect(getBalanceReportAccountOptions(data)).toEqual([]);
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
  expect(getBalanceReportAccountOptions(data)).toEqual([]);
  data.month = '2026-10';
  expect(getBalanceReportAccountOptions(data).map((row) => row.id)).toEqual([settlementId(940), settlementId(942)]);
  data.month = '2026-11';
  expect(getBalanceReportAccountOptions(data).map((row) => row.id)).toEqual([settlementId(940)]);
});


test('월초부터 월말 순서대로 잔액을 누적하며 개별 계좌에는 그 계좌의 기초·월말 잔액만 사용', () => {
  const data = settlementFixture();
  const document = getBalanceReportDocument(data);
  expect(document.rows.slice(0, 3).map((row) => row[7])).toEqual([BigInt(130000), BigInt(118000), BigInt(128000)]);
  data.balances.buildings[0].accountBalances = [{
    accountId: settlementId(2),
    startBalance: '50000',
    balance: '78000'
  }];
  const account = getBalanceReportDocument(data, settlementId(3), settlementId(2));
  expect(account.rows.slice(0, 3).map((row) => row[7])).toEqual([BigInt(80000), BigInt(68000), BigInt(78000)]);
  expect(account.summary.find((row) => row.label === '기초 잔액')?.value).toBe(BigInt(50000));
  expect(account.total?.[7]).toBe(BigInt(78000));
  data.balances.buildings[0].accountBalances[0].startBalance = null;
  data.balances.buildings[0].accountBalances[0].balance = null;
  expect(getBalanceReportDocument(data, '', settlementId(2)).rows[0][7]).toBe('설정 필요');
  data.month = '2026-09';
  expect(getReportPeriodLabel(data)).toBe('9월 마감');
  data.month = '2026-10';
  expect(getReportPeriodLabel(data)).toBe('집계 중');
});