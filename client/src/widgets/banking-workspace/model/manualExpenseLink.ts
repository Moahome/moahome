import type { BankingTransaction } from '../api/bankingApiTypes';

/** 수동 지출과 미확정 은행 출금은 같은 통장·실제 거래일·금액일 때만 후보로 제시합니다. */
export function getManualExpenseLinkCandidates(row: BankingTransaction, rows: readonly BankingTransaction[]) {
  if (row.direction !== 'EXPENSE' || row.transferCandidate || row.expense?.manualBankLinked)
    return [];

  const isManual = row.sourceType === 'MANUAL' && row.status === 'CONFIRMED' && Boolean(row.expense);
  const isBank = (row.sourceType === undefined || row.sourceType === 'BANK_IMPORT') && row.status === 'PENDING' && !row.expense;
  if (!isManual && !isBank)
    return [];

  return rows.filter((candidate) => candidate.id !== row.id && candidate.direction === 'EXPENSE'
    && !candidate.transferCandidate && candidate.accountId === row.accountId && candidate.date === row.date
    && BigInt(candidate.amount) === BigInt(row.amount)
    && (isManual
      ? (candidate.sourceType === undefined || candidate.sourceType === 'BANK_IMPORT') && candidate.status === 'PENDING' && !candidate.expense
      : candidate.sourceType === 'MANUAL' && candidate.status === 'CONFIRMED' && Boolean(candidate.expense) && !candidate.expense?.manualBankLinked));
}
