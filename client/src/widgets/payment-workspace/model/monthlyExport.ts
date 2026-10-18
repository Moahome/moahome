import { createReportWorkbook } from '@/shared/lib/excel-report';
import {
  getMonthlyPreviewRows,
  filterMonthlyPreviewRows,
  type MonthlyCollectionFilters,
  type PreviewLedger
} from './paymentPreview';

/** 현재 조회 조건의 전체 세대와 합계만 내보내고 미확정 정산은 금액으로 확정하지 않습니다. */
export async function createMonthlyWorkbook(ledger: PreviewLedger, month: string, filters: MonthlyCollectionFilters = {
  query: '',
  building: '',
  status: '전체'
}): Promise<Blob> {
  const rows = filterMonthlyPreviewRows(getMonthlyPreviewRows(ledger, month), filters);
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance' | 'prepaid') => rows.reduce((total, row) => total + row[key] + (key === 'billed' ? row.settlementAmount ?? BigInt(0) : BigInt(0)), BigInt(0));
  const balance = rows.some((row) => row.settlementPending) ? '정산 확인 필요' : sum('balance');

  return createReportWorkbook({
    title: '모아홈 월별 수납 현황',
    description: `세대별 청구·수납 및 미수금 보고서 · ${filters.status}${filters.building ? ` · ${filters.building}` : ''}${filters.query.trim() ? ` · 검색: ${filters.query.trim()}` : ''}`,
    sheet: '월별 수납 현황',
    columns: ['세대', '세대 대표', '최근 입금자', '전월 이월액', '당월 발생액', '당월 수납 반영액', '미수금 잔액', '선입금 잔액', '상태'].map((label, index) => ({
      label,
      width: index > 2 && index < 8 ? 24 : 20,
      align: index > 2 && index < 8 ? 'right' : 'left'
    })),
    summary: [{
      label: '당월 수납 반영액',
      value: sum('applied')
    }, {
      label: '조회 세대',
      value: `${rows.length}세대`
    }, {
      label: '조회 월',
      value: month.replace('-', '년 ') + '월'
    }],
    rows: rows.map((row) => [row.unitLabel, row.representativeName, row.latestPayer, row.carry, row.billed + (row.settlementAmount ?? BigInt(0)), row.applied, row.settlementPending ? '정산 확인 필요' : row.balance, row.prepaid, row.status]),
    total: ['합계', '', '', sum('carry'), sum('billed'), sum('applied'), balance, sum('prepaid'), ''],
    note: '※ 당월 수납 반영액은 청구에 충당된 금액이며 통장에 실제 입금된 금액과 다를 수 있습니다. 금액은 원 단위입니다.'
  });
}
