import type { ReportDefinition } from '@/shared/lib/excel-report';
import {
  formatReportTimestamp,
  getReportPeriodLabel
} from '@/shared/lib/pdf-report';
import type { MonthlySettlementSnapshot } from '../api/monthlySettlementApiTypes';
import { getSettlementReport } from './monthlySettlement';

/** 템플릿의 일곱 영역을 같은 월 스냅샷으로 구성하고 실제 수납·청구 충당·통장 출금·동별 부담액을 분리합니다. */
export function getMonthlyReportDocuments(data: MonthlySettlementSnapshot): ReportDefinition[] {
  const report = getSettlementReport(data);
  const amount = (value: bigint | string | null) => value === null ? '확인 필요' : typeof value === 'string' ? BigInt(value) : value;
  const sumBalances = (values: (string | null)[]) => values.length && values.every((value) => value !== null) ? values.reduce((total, value) => total + BigInt(value!), BigInt(0)) : null;
  const moneyColumns = (labels: string[]) => labels.map((label) => ({
    label,
    width: 24,
    align: 'right' as const
  }));
  const common = {
    summary: []
  };
  const included = report.external.filter((row) => !row.excluded);
  const sumExternal = (field: 'amount' | 'received' | 'remaining') => included.reduce((total, row) => total + BigInt(row[field]), BigInt(0));
  const sumCollections = (field: 'carry' | 'prepaid') => report.collections.reduce((total, row) => total + row[field], BigInt(0));
  return [
    {
      ...common,
      title: '월별 정산 종합보고서',
      sheet: '종합 요약',
      description: `${data.month} 월간 운영 현황`,
      columns: [{
        label: '항목',
        width: 28
      }, {
        label: '금액',
        width: 26,
        align: 'right'
      }, {
        label: '집계 기준',
        width: 42
      }],
      rows: [
        ['통장 입금', report.bankIncome, '은행 원본·유효 수동 포함'], ['통장 출금', report.bankExpense, '외부 부담·내부 이체 포함'], ['관리비 실제 수납', report.householdIncome, '입금월 기준'], ['동별 보유금', amount(report.buildingBalance), '조회 월말 동별 합계'],
        ['당월 청구액', report.billed, '발행된 당월 청구'], ['청구 수납 반영액', report.applied, '과거 선입금 충당 포함'], ['월별 수납 미수금', amount(report.receivable), '전월 이월액 포함'], ['외부 미회수액', report.outstanding, '선택 월 지출 · 정산 제외분 제외']
      ],
      summary: [{
        label: '조회 월',
        value: data.month
      }, {
        label: '기간 상태',
        value: getReportPeriodLabel(data)
      }, {
        label: '조회시각',
        value: formatReportTimestamp(data.generatedAt)
      }],
      note: '실제 수납·청구 충당·동별 지출·외부 회수는 서로 다른 기준입니다. 통장 입출금 차액을 회계상 손익으로 보지 않습니다.'
    },
    {
      ...common,
      title: '월말 점검',
      sheet: '월말 점검',
      description: '선택 월에 확인할 항목',
      columns: [{
        label: '점검 항목',
        width: 32
      }, {
        label: '건수',
        width: 16
      }, {
        label: '확인 상태',
        width: 26
      }],
      rows: report.checks.map((row) => [row.title, `${row.count}건`, row.count === 0 ? '확인 항목 없음' : row.id === 'external' ? '미회수 내역' : '확인 필요']),
      note: '점검 건수는 확인 안내이며 자동 마감 차단 또는 통장 대사 완료를 뜻하지 않습니다.'
    },
    {
      ...common,
      title: '통장별 잔액',
      sheet: '통장별 잔액',
      description: '확인시점·출처와 월말 계산 잔액',
      columns: [{
        label: '통장',
        width: 36
      }, ...moneyColumns(['확인 잔액']), {
        label: '확인시점·출처',
        width: 36
      }, ...moneyColumns(['계산 잔액']), {
        label: '비교 상태',
        width: 26
      }],
      rows: report.accounts.map((row) => [row.label, amount(row.confirmed), `${row.asOf ?? '미확인'} · ${row.source}`, amount(row.calculated), row.comparison]),
      note: '같은 금액이어도 확인시점이 다르면 차액 0원 또는 대사 완료로 판정하지 않습니다.'
    },
    {
      ...common,
      title: '동별 보유금 현황',
      sheet: '동별 자금',
      description: '통장 전체 입출금과 구분한 동별 귀속 자금',
      columns: [{
        label: '동',
        width: 20
      }, ...moneyColumns(['기초 보유금', '월 입금', '부담 지출', '기말 보유금'])],
      rows: report.buildings.map((row) => [row.label, amount(row.startBalance), BigInt(row.income), BigInt(row.expense), amount(row.balance)]),
      total: ['합계', amount(sumBalances(report.buildings.map((row) => row.startBalance))), report.buildings.reduce((total, row) => total + BigInt(row.income), BigInt(0)), report.buildings.reduce((total, row) => total + BigInt(row.expense), BigInt(0)), amount(report.buildingBalance)],
      note: '동별 거래 후 잔액을 포함한 상세 명세는 동별 잔고·정산에서 내려받습니다.'
    },
    {
      ...common,
      title: '수납과 미납',
      sheet: '수납과 미납',
      description: '전월 이월을 포함한 청구월 누적 기준',
      columns: [{
        label: '세대',
        width: 24
      }, {
        label: '대표',
        width: 19
      }, ...moneyColumns(['전월 이월', '당월 발생', '수납 반영', '미수금', '선입금']), {
        label: '상태',
        width: 22
      }],
      rows: [...report.collections].sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'ko', {
        numeric: true
      }) || a.unitId.localeCompare(b.unitId)).map((row) => [row.unitLabel, row.representativeName || '—', row.carry, row.billed + (row.settlementAmount ?? BigInt(0)), row.applied, row.settlementPending ? '정산 확인 필요' : row.balance, row.prepaid, row.status]),
      total: ['합계', '', sumCollections('carry'), report.billed, report.applied, amount(report.receivable), sumCollections('prepaid'), ''],
      note: '실제 수납과 청구 수납 반영액은 다를 수 있습니다. 정산 미정 미수금을 0원으로 표시하지 않습니다.'
    },
    {
      ...common,
      title: '통장 입출금 명세',
      sheet: '입출금 명세',
      description: '은행 원본과 유효 수동 거래 · 내부 이체 포함',
      columns: [{
        label: '일자',
        width: 18
      }, {
        label: '통장',
        width: 36
      }, {
        label: '내용',
        width: 40
      }, ...moneyColumns(['입금', '출금']), {
        label: '출처',
        width: 22
      }, {
        label: '내부 이체',
        width: 16
      }],
      rows: report.cash.map((row) => [row.date, data.balances.accounts?.find((account) => account.id === row.accountId)?.label ?? data.payments.accounts.find((account) => account.id === row.accountId)?.label ?? '통장 미확인', row.label, row.direction === 'INCOME' ? row.amount : BigInt(0), row.direction === 'EXPENSE' ? row.amount : BigInt(0), row.source, row.transfer ? '내부 이체' : '—']),
      total: ['합계', '', '', report.bankIncome, report.bankExpense, '', ''],
      note: '통장 출금에는 외부 부담과 내부 이체가 포함됩니다. 각 동의 실제 부담 지출과 구분합니다.'
    },
    {
      ...common,
      title: '외부 부담금',
      sheet: '외부 부담금',
      description: '선택 월 지출 · 정산 제외분은 합계에서 제외',
      columns: [{
        label: '지출일',
        width: 18
      }, {
        label: '부담처',
        width: 18
      }, {
        label: '지출명',
        width: 30
      }, ...moneyColumns(['부담액', '회수액', '미회수액']), {
        label: '회수 상태',
        width: 22
      }],
      rows: report.external.map((row) => [row.date, row.label, row.expenseName, BigInt(row.amount), BigInt(row.received), BigInt(row.remaining), row.recoveryStatus]),
      total: ['합계', '', '', sumExternal('amount'), sumExternal('received'), report.outstanding, ''],
      note: '정산 제외 내역은 표시하되 합계에서 제외하고, 외부 회수액은 관리비 실제 수납으로 합산하지 않습니다.'
    }
  ];
}

/** 템플릿의 요약과 세부 표를 한 시트로 저장합니다. */
export async function createMonthlyReportWorkbook(data: MonthlySettlementSnapshot): Promise<Blob> {
  const { createMonthlyStyledWorkbook } = await import('./monthlyReportWorkbook');
  return createMonthlyStyledWorkbook(getMonthlyReportDocuments(data));
}
