import type { BalanceWorkspace } from '../api/bankingBalanceApiTypes';

/** 이체일부터 현재까지의 최소 보유금으로 미래 입금의 선사용과 이후 확정 출금의 초과를 함께 막습니다. */
export function getTransferLimits(data: BalanceWorkspace | undefined, accountId: string, date: string): Record<string, string | null> {
  if (!data || data.accountId !== accountId || data.legacyOpening) return {};
  return Object.fromEntries(data.buildings.map((building) => {
    if (building.balance === null) return [building.id, null];
    const daily = new Map<string, bigint>();
    let balance = BigInt(building.balance);
    for (const entry of data.entries) {
      if (entry.buildingId !== building.id || entry.accountId !== accountId || entry.date <= date) continue;
      const net = BigInt(entry.income) - BigInt(entry.expense);
      daily.set(entry.date, (daily.get(entry.date) ?? BigInt(0)) + net);
      balance -= net;
    }
    let limit = balance;
    for (const [, net] of [...daily].sort(([left], [right]) => left.localeCompare(right))) {
      balance += net;
      if (balance < limit) limit = balance;
    }
    return [building.id, limit.toString()];
  }));
}
