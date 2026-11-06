import { formatDateRange } from '@/shared/lib/date-range';
import {
  createReportWorkbook,
  type ReportDefinition
} from '@/shared/lib/excel-report';
import type { BankingTransaction } from '../api/bankingApiTypes';
import type { ExpenseExportContext } from './expenseExportTypes';
import { getExpenseAccountLabel } from '@/entities/banking';
import { getExpenseAmount } from './expenseAllocation';

/** 조회 조건 전체와 관리 동 부담액을 첨부 내역서 서식에 표시하며 외부 금액은 합산하지 않습니다. */
export function getExpenseReportDocument(rows: readonly BankingTransaction[], buildingIds: readonly string[], context?: ExpenseExportContext): ReportDefinition {
  const amount = rows.reduce((sum, row) => sum + getExpenseAmount(row, buildingIds), BigInt(0));
  const month = context?.month ?? rows[0]?.date.slice(0, 7) ?? '';
  let period = month ? month.replace('-', '년 ') + '월' : '전체 기간';
  if (context?.period) period = formatDateRange(context.period);
  const scope = `${period} · ${context?.buildingLabel ?? '선택 동'}`;

  return {
    title: '모아홈 지출 내역',
    description: '공용 지출 보고서',
    sheet: '지출 내역',
    columns: [{
      label: '거래일',
      width: 30
    }, {
      label: '지출명',
      width: 38
    }, {
      label: '계정과목',
      width: 30
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
      label: '조회 기간 / 관리대상',
      value: scope
    }],
    rows: rows.map((row) => [
      row.date,
      row.expense?.category || row.payer,
      getExpenseAccountLabel(row.expense),
      getExpenseAmount(row, buildingIds)
    ]),
    total: ['합계', '', '', amount],
    note: `※ 금액은 원 단위이며 선택한 관리 동의 부담액만 포함합니다.${context?.search ? ` 검색 조건: ${context.search}` : ''}`
  };
}

/** 미리보기와 동일한 전체 조회 자료를 기존 Excel 서식으로 저장합니다. */
export async function createExpenseWorkbook(rows: readonly BankingTransaction[], buildingIds: readonly string[], context?: ExpenseExportContext): Promise<Blob> {
  return createReportWorkbook(getExpenseReportDocument(rows, buildingIds, context));
}
