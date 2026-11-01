import type { BankingTransaction } from '../api/bankingApiTypes';

/** 수동 등록 한 건을 은행 원본과 비교하는 후보이며 같은 금액만으로 거래를 취소하거나 제외하지 않습니다. */
export function getBankingDuplicateIds(rows: readonly BankingTransaction[], asOf: string): Set<string> {
  const manual = (row: BankingTransaction) => row.sourceType === 'MANUAL' || row.id.startsWith('receipt:');
  const key = (row: BankingTransaction) => `${row.accountId}:${row.date}:${row.direction}:${BigInt(row.amount)}`;
  const originalKeys = new Set(rows.filter((row) => !manual(row) && row.date <= asOf).map(key));

  return new Set(rows.filter((row) => manual(row) && row.date <= asOf
    && ['PENDING', 'ON_HOLD', 'CONFIRMED'].includes(row.status) && originalKeys.has(key(row))).map((row) => row.id));
}

/** 현재 업무는 가상의 최솟값 대신 실제 후보가 발생한 첫날부터 현재까지를 조회합니다. */
export function getBankingReviewRange(rows: readonly BankingTransaction[], asOf: string) {
  const dates = rows.filter((row) => row.date <= asOf).map((row) => row.date).sort();

  return {
    startDate: dates[0] ?? asOf,
    endDate: asOf
  };
}
