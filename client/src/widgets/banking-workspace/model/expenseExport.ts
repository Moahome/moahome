import { createReportWorkbook } from '@/shared/lib/excel-report';
import type { BankingTransaction } from '../api/bankingApiTypes';
import { getExpenseAmount } from './expenseAllocation';

/** 조회 조건 전체와 관리 동 부담액을 첨부 내역서 서식에 표시하며 외부 금액은 합산하지 않습니다. */
export async function createExpenseWorkbook(rows: readonly BankingTransaction[], buildingIds: readonly string[], context?: {
  month: string;
  buildingLabel: string;
  search: string;
}): Promise<Blob> {
  const amount = rows.reduce((sum, row) => sum + getExpenseAmount(row, buildingIds), BigInt(0));
  const month = context?.month ?? rows[0]?.date.slice(0, 7) ?? '';
  const scope = `${month ? month.replace('-', '년 ') + '월' : '전체 기간'} · ${context?.buildingLabel ?? '선택 동'}`;

  return createReportWorkbook({
    title: '모아홈 지출 내역',
    description: '월별 공용 지출 보고서',
    sheet: '지출 내역',
    columns: [{
      label: '거래일시',
      width: 30
    }, {
      label: '지출명',
      width: 38
    }, {
      label: '지출액',
      width: 25,
      align: 'right'
    }],
    summary: [{
      label: '총 지출액',
      value: amount
    }, {
      label: '지출 건수',
      value: `${rows.length}건`
    }, {
      label: '조회 월 / 관리대상',
      value: scope
    }],
    rows: rows.map((row) => [
      `${row.date}${row.time ? ` ${row.time}` : ''}`,
      row.expense?.category || row.payer,
      getExpenseAmount(row, buildingIds)
    ]),
    total: ['합계', '', amount],
    note: `※ 금액은 원 단위이며 선택한 관리 동의 부담액만 포함합니다.${context?.search ? ` 검색 조건: ${context.search}` : ''}`
  });
}
