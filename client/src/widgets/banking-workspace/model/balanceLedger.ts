import { createReportWorkbook } from '@/shared/lib/excel-report';
import { getAccountBalanceTotal } from './accountBalance';
import type {
  BalanceBuilding,
  BalanceEntry,
  BalanceWorkspace
} from '../api/bankingBalanceApi';

/** 화면에 표시한 통장 잔액과 동별 합계의 차이를 계산하며 미설정 값을 0원으로 채우거나 차액을 자동 배분하지 않습니다. */
export function getBalanceSummary(data: BalanceWorkspace) {
  const complete = data.buildings.length > 0 && data.buildings.every((b) => b.balance !== null);
  const total = complete ? data.buildings.reduce((sum, b) => sum + BigInt(b.balance!), BigInt(0)) : null;
  const accountTotal = getAccountBalanceTotal(data).amount;
  const difference = accountTotal !== null && total !== null ? BigInt(accountTotal) - total : null;
  const external = data.externals.filter((row) => !row.excluded).reduce((sum, row) => sum + BigInt(row.remaining), BigInt(0));

  return {
    total,
    difference,
    external
  };
}

/** 원본 거래일 순으로 동별 실제 이동과 누적 잔고를 계산합니다. 원본의 출금 전액을 다시 더하지 않습니다. */
export function getBuildingLedger(building: BalanceBuilding, entries: readonly BalanceEntry[], month: string) {
  let balance = building.startBalance === null ? null : BigInt(building.startBalance);

  return entries.filter((e) => e.buildingId === building.id && e.date.startsWith(month))
    .sort((a, b) => `${a.date} ${a.time ?? ''} ${a.id}`.localeCompare(`${b.date} ${b.time ?? ''} ${b.id}`))
    .map((e) => {
      if (balance !== null) balance += BigInt(e.income) - BigInt(e.expense);
      return {
        ...e,
        balance
      };
    });
}

/** 현재 조회·선택 동 전체를 같은 보고서 서식으로 저장하고 미설정 잔고는 0원으로 만들지 않습니다. */
export async function createBalanceWorkbook(data: BalanceWorkspace, buildings: readonly BalanceBuilding[]) {
  const total = buildings.every((b) => b.balance !== null) ? buildings.reduce((sum, b) => sum + BigInt(b.balance!), BigInt(0)) : '설정 필요';
  const sum = (field: 'income' | 'expense') => buildings.reduce((sum, b) => sum + BigInt(b[field]), BigInt(0));

  return createReportWorkbook({
    title: '모아홈 동별 잔고·정산',
    description: '동별 통장 보유금 현황',
    sheet: '동별 잔고',
    columns: ['동', '기초 잔고', '월 입금', '월 지출', '월말 잔고'].map((label, index) => ({
      label,
      width: index === 0 ? 24 : 28,
      align: index === 0 ? 'left' : 'right'
    })),
    summary: [{
      label: '동별 잔고 합계',
      value: total
    }, {
      label: '조회 동',
      value: `${buildings.length}개 동`
    }, {
      label: '조회 월',
      value: data.month.replace('-', '년 ') + '월'
    }],
    rows: buildings.map((b) => [b.label, b.startBalance === null ? '설정 필요' : BigInt(b.startBalance), BigInt(b.income), BigInt(b.expense), b.balance === null ? '설정 필요' : BigInt(b.balance)]),
    total: ['합계', '', sum('income'), sum('expense'), total],
    note: `※ 잔고 기준일: ${data.cutoffDate ?? '미설정'}. 이전 월은 확인된 입출금을 역산합니다. 미처리·귀속 미확인 금액은 동별 잔고에 포함하지 않습니다.`,
    additionalSheets: buildings.map((building, index) => {
      const entries = getBuildingLedger(building, data.entries, data.month);

      return {
        title: `모아홈 ${building.label} 상세 원장`,
        description: `${data.month} 실제 입금·부담 지출 및 누적 잔고`,
        sheet: `원장 ${index + 1}`,
        columns: ['거래일시', '입금자·지출명', '입금', '지출', '잔고'].map((label, column) => ({
          label,
          width: column === 0 ? 30 : 28,
          align: column > 1 ? 'right' as const : 'left' as const
        })),
        summary: [{
          label: '월말 잔고',
          value: building.balance === null ? '설정 필요' : BigInt(building.balance)
        }, {
          label: '거래 건수',
          value: `${entries.length}건`
        }, {
          label: '조회 월 / 동',
          value: `${data.month} · ${building.label}`
        }],
        rows: entries.map((entry) => [`${entry.date}${entry.time ? ` ${entry.time}` : ''}`, entry.label, BigInt(entry.income), BigInt(entry.expense), entry.balance ?? '설정 필요']),
        note: `※ 잔고 기준일 ${data.cutoffDate ?? '미설정'}. 조회 월 전체의 확정 현금 이동이며 기준일 이전 잔고는 역산합니다.`
      };
    })
  });
}
