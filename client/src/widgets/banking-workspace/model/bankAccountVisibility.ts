import type { BankingAccount } from '../api/bankingApiTypes';

/** 종료 통장은 실제 사용한 기간에만 조회하며 이전 응답에 기간 정보가 없으면 이력을 임의로 숨기지 않습니다. */
export function getAccountsForMonth(accounts: readonly BankingAccount[], month: string): BankingAccount[] {
  return accounts.filter((account) => {
    if (account.availableFrom && account.availableFrom.slice(0, 7) > month) return false;
    if (account.status !== 'CLOSED') return true;
    if (account.hasHistory === false) return false;

    return !account.closedOn || account.closedOn.slice(0, 7) >= month;
  });
}
