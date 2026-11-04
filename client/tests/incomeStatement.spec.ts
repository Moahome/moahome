import {
  expect,
  test
} from '@playwright/test';
import {
  getIncomeStatement,
  getIncomeTrend
} from '../src/screens/accounting/income-statement/model/incomeStatement';
import { createIncomeStatementExample } from './support/incomeExample';
import { getIncomeReportDocuments } from '../src/screens/accounting/income-statement/model/incomeStatementReport';
import { createReportWorkbook } from '../src/shared/lib/excel-report';
import {
  strFromU8,
  unzipSync
} from 'fflate';

test('예시의 요약·계정과목·월별 합계와 보고서 금액이 일치한다', () => {
  const source = createIncomeStatementExample();
  const report = getIncomeStatement(source, source.availableRange)!;
  expect([report.revenue, report.expense, report.profit]).toEqual([BigInt(4760000), BigInt(3760000), BigInt(1000000)]);
  for (const key of ['revenue', 'expense', 'profit'] as const) {
    expect(report.monthly.reduce((total, row) => total + row[key], BigInt(0))).toBe(report[key]);
  }
  expect(report.rows.filter((row) => row.id.startsWith('operatingExpense:')).reduce((total, row) => total + row.amount, BigInt(0))).toBe(report.expense);
  const documents = getIncomeReportDocuments(report, false);
  expect(documents[0].total).toEqual(['기간 순손익', report.profit]);
  expect(documents[1].rows.at(-1)).toEqual(['2026-10', BigInt(1230000), BigInt(920000), BigInt(310000)]);
  expect(documents.every((document) => document.description.includes('예시 데이터'))).toBe(true);
});

test('기간 경계·동별 합계·조회 시작 월부터의 누계를 같은 원 단위로 계산한다', () => {
  const source = createIncomeStatementExample();
  const range = {
    startMonth: '2026-08',
    endMonth: '2026-09'
  };
  const all = getIncomeStatement(source, range)!;
  const a = getIncomeStatement(source, range, 'example-a')!;
  const b = getIncomeStatement(source, range, 'example-b')!;
  expect(all.monthly.map((row) => row.month)).toEqual(['2026-08', '2026-09']);
  for (const key of ['revenue', 'expense', 'profit'] as const) expect(a[key] + b[key]).toBe(all[key]);
  expect(getIncomeTrend(all, true)[0]).toEqual(all.monthly[0]);
  expect(getIncomeTrend(all, true).at(-1)?.profit).toBe(all.profit);
  expect(getIncomeReportDocuments(all, true)[1].rows.at(-1)?.[3]).toBe(all.profit);
});

test('자료 범위 밖·역전 기간·존재하지 않는 동은 0원 손익으로 대체하지 않는다', () => {
  const source = createIncomeStatementExample();
  for (const range of [
    {
      startMonth: '2026-06',
      endMonth: '2026-10'
    },
    {
      startMonth: '2026-10',
      endMonth: '2026-11'
    },
    {
      startMonth: '2026-10',
      endMonth: '2026-07'
    },
    {
      startMonth: '2026-00',
      endMonth: '2026-10'
    }
  ]) expect(getIncomeStatement(source, range)).toBeNull();
  expect(getIncomeStatement(source, source.availableRange, 'unknown')).toBeNull();
});

test('같은 이름의 과목 ID·큰 정수·영업외 비용·음수 조정과 연도 경계를 보존한다', () => {
  const source = createIncomeStatementExample();
  source.availableRange = {
    startMonth: '2026-12',
    endMonth: '2027-01'
  };
  source.records = [
    {
      id: '1',
      accountId: 'a',
      accountName: '같은 이름',
      group: 'operatingRevenue',
      month: '2026-12',
      buildingId: 'example-a',
      amount: '9007199254740993'
    },
    {
      id: '2',
      accountId: 'b',
      accountName: '같은 이름',
      group: 'operatingRevenue',
      month: '2027-01',
      buildingId: 'example-a',
      amount: '-1'
    },
    {
      id: '3',
      accountId: 'c',
      accountName: '영업외 비용',
      group: 'otherExpense',
      month: '2027-01',
      buildingId: 'example-a',
      amount: '100'
    }
  ];
  const report = getIncomeStatement(source, source.availableRange)!;
  expect(report.rows.filter((row) => row.label === '같은 이름')).toHaveLength(2);
  expect(report.profit).toBe(BigInt('9007199254740892'));
  expect(report.monthly[1].profit).toBe(-BigInt(101));
  expect(report.rows.find((row) => row.id === 'other-profit')?.amount).toBe(-BigInt(100));
});

test('두 열 손익 Excel은 요약 병합을 유지하고 음수 금액을 정확한 숫자·붉은 글씨로 저장한다', async () => {
  const source = createIncomeStatementExample();
  source.records = source.records.map((record) => record.group === 'operatingRevenue' ? {
    ...record,
    amount: '0'
  } : record);
  const report = getIncomeStatement(source, source.availableRange)!;
  const documents = getIncomeReportDocuments(report, false);
  const blob = await createReportWorkbook({
    ...documents[0],
    additionalSheets: documents.slice(1)
  });
  const workbook = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const sheet = strFromU8(workbook['xl/worksheets/sheet1.xml']);
  const styles = strFromU8(workbook['xl/styles.xml']);
  expect(sheet).toContain('-3760000');
  expect(sheet).not.toContain('colspan="0"');
  expect(styles).toContain('EF4444');
  expect(strFromU8(workbook['xl/workbook.xml'])).toContain('월별 손익');
});
