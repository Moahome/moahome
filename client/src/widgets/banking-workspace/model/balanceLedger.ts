import type {
  BalanceBuilding,
  BalanceEntry,
  BalanceWorkspace
} from '../api/bankingBalanceApiTypes';
import { getAccountBalanceTotal } from './accountBalance';

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
