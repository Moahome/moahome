import type {
  AccountLedgerWorkspace,
  LedgerSort
} from '../api/accountLedgerApiTypes';

/** 계정 코드순을 고정하고 같은 과목 안에서만 최신·오래된 날짜 방향을 바꿉니다. 누계는 원본 행 값을 유지합니다. */
export function sortLedger(data: AccountLedgerWorkspace, sort: LedgerSort): AccountLedgerWorkspace {
  const rows = sort === 'oldest' ? [...data.rows].reverse() : [...data.rows];
  const codes = new Map(data.accounts.map((account) => [account.id, account.code]));
  rows.sort((left, right) => (codes.get(left.entry.accountId) ?? '').localeCompare(codes.get(right.entry.accountId) ?? ''));
  return {
    ...data,
    rows
  };
}
