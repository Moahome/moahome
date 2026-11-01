import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  createMonthlyWorkbook,
  getMonthlyReportDocument,
  getMonthlyReportMetrics
} from '../src/widgets/payment-workspace/model/monthlyExport';
import type { MonthlyReportSnapshot } from '../src/widgets/payment-workspace/model/monthlyExportTypes';

/** 실제 계산 규칙에 필요한 청구·확정 입금·미확정 정산만 구성하고 다운로드가 원장을 변경하지 않는지 확인합니다. */
function snapshot(): MonthlyReportSnapshot {
  return {
    propertyId: 'property',
    propertyName: '성내빌라',
    generatedAt: '2026-10-31T03:00:00Z',
    month: '2026-10',
    filters: {
      query: '',
      building: '',
      status: '전체',
    },
    ledger: {
      asOf: '2026-10-31',
      accounts: [],
      history: [],
      units: ['102동 101호', '103동 201호', '102동 301호', '104동 401호'].map((label, index) => ({
        id: `unit-${index}`,
        label,
        buildingName: label.slice(0, 4),
        representativeName: index === 0 ? '=대표' : `대표 ${index}`,
        status: 'ACTIVE',
      })),
      charges: [
        {
          id: 'old',
          unitId: 'unit-0',
          month: '2026-09',
          amount: '10000',
          status: 'ISSUED'
        },
        {
          id: 'current',
          unitId: 'unit-0',
          month: '2026-10',
          amount: '20000',
          status: 'ISSUED'
        },
        {
          id: 'paid',
          unitId: 'unit-1',
          month: '2026-10',
          amount: '10000',
          status: 'ISSUED'
        },
        {
          id: 'zero',
          unitId: 'unit-2',
          month: '2026-10',
          amount: '0',
          status: 'ISSUED'
        },
        {
          id: 'canceled',
          unitId: 'unit-3',
          month: '2026-10',
          amount: '99999',
          status: 'CANCELED'
        },
      ],
      payments: [
        ['old-payment', 'unit-0', '2026-09-15', '5000'],
        ['current-payment', 'unit-0', '2026-10-15', '15000'],
        ['overpaid', 'unit-1', '2026-10-15', '15000'],
      ].map(([id, unitId, date, amount]) => ({
        id,
        unitId,
        date,
        amount,
        payer: '=입금자',
        source: 'MANUAL',
        status: 'CONFIRMED',
        accountId: '',
        reason: '',
        allocations: [],
      })),
    },
  };
}

test('빌라 이름과 전체 부과 세대의 합계·미확정 정산을 같은 문서에 보존한다', () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  const document = getMonthlyReportDocument(data);
  expect(document.title).toBe('성내빌라 월별 수납 현황');
  expect(document.rows.map((row) => row[0])).toEqual(['102동 101호', '103동 201호', '102동 301호']);
  expect(document.total).toEqual(['합계', '', BigInt(5000), BigInt(30000), BigInt(25000), '정산 확인 필요', '']);
  expect(document.columns.map((column) => column.label)).not.toContain('선입금 잔액');
  expect(document.columns.map((column) => column.label)).not.toContain('최근 입금자');
  expect(document.rows.find((row) => row[0] === '102동 301호')?.[5]).toBe('정산 확인 필요');
  expect(JSON.stringify(data)).toBe(before);
});

test('상태·검색·동을 함께 적용해 필터 안의 세대와 합계만 내보내며 빈 결과는 0건으로 표시한다', () => {
  const data = snapshot();
  data.filters = {
    query: '201',
    building: '103동',
    status: '납부완료'
  };
  const selected = getMonthlyReportDocument(data);
  expect(selected.rows.map((row) => row[0])).toEqual(['103동 201호']);
  expect(selected.total).toEqual(['합계', '', BigInt(0), BigInt(10000), BigInt(10000), '']);
  expect(selected.columns.map((column) => column.label)).not.toContain('미수금 잔액');
  expect(getMonthlyReportMetrics(selected).map((metric) => metric.label)).toEqual(['전월 이월액', '당월 발생액', '당월 수납 반영액']);
  expect(selected.description).toContain('검색: 201');
  data.filters.status = '미납';
  const empty = getMonthlyReportDocument(data);
  expect(empty.rows).toEqual([]);
  expect(empty.summary.find((item) => item.label === '조회 세대')?.value).toBe('0세대');
  expect(empty.total).toEqual(['합계', '', BigInt(0), BigInt(0), BigInt(0), '']);
  expect(empty.columns.map((column) => column.label)).toEqual(['세대', '세대 대표', '전월 이월액', '당월 발생액', '미수금 잔액', '상태']);
  expect(getMonthlyReportMetrics(empty).map((metric) => metric.label)).toEqual(['전월 이월액', '당월 발생액', '미수금 잔액']);
});

test('실제 Excel도 빌라 이름을 사용하고 이름·입금자에 수식을 만들지 않는다', async () => {
  const data = snapshot();
  const blob = await createMonthlyWorkbook(data);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, value]) => strFromU8(value)).join('');
  expect(xml).toContain('성내빌라 월별 수납 현황');
  expect(xml).toContain('정산 확인 필요');
  expect(xml).toContain('=대표');
  expect(xml).not.toContain('<f>');
  expect(xml).not.toContain('모아홈 월별 수납 현황');
  expect(strFromU8(files['xl/workbook.xml']).match(/<sheet /g)).toHaveLength(1);
});


test('선입금 보고서는 미부과 세대와 완납 후 잔액을 함께 내보내며 다른 탭의 기존 열은 유지한다', async () => {
  const data = snapshot();
  data.filters.status = '선입금';
  data.ledger.openingCredits = [{
    id: 'opening-only',
    unitId: 'unit-3',
    date: '2026-09-30',
    amount: '30000',
    allocations: []
  }];
  const document = getMonthlyReportDocument(data);
  expect(document.columns.map((column) => column.label)).toEqual(['세대', '세대 대표', '선입금 잔액', '상태']);
  expect(document.rows.map((row) => row[0])).toEqual(['103동 201호', '104동 401호']);
  expect(document.rows.map((row) => row[2])).toEqual([BigInt(5000), BigInt(30000)]);
  expect(document.total?.[2]).toBe(BigInt(35000));
  expect(getMonthlyReportMetrics(document).at(-1)).toMatchObject({
    label: '선입금 잔액',
    value: BigInt(35000)
  });
  const blob = await createMonthlyWorkbook(data);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  expect(Object.values(files).map((file) => strFromU8(file)).join('')).toContain('선입금 잔액');
});
