import type {
  AccountBalance,
  BalanceWorkspace
} from '../api/bankingBalanceApi';

/** 실제 확인값이 없을 때만 계산값을 표시하며, 미확인 금액을 0원으로 대체하지 않습니다. */
export function getAccountBalanceDisplay(account: AccountBalance) {
  if (account.balance !== null) return {
    amount: account.balance,
    calculated: false,
    description: account.asOf
  };
  if (account.calculatedBalance != null && account.calculationBasisDate) return {
    amount: account.calculatedBalance,
    calculated: true,
    description: `${account.calculationBasisDate} 기준 · 등록 입출금 반영`
  };
  return {
    amount: null,
    calculated: false,
    description: account.asOf
  };
}

/** 조회 범위의 표시 잔액을 합산해 요약과 차액에 같은 기준을 사용하며, 근거가 없는 통장은 0원으로 채우지 않습니다. */
export function getAccountBalanceTotal(data: BalanceWorkspace) {
  const accounts = data.accountId ? data.accounts?.filter((account) => account.id === data.accountId) : data.accounts;
  const displays = accounts?.map(getAccountBalanceDisplay) ?? [];
  let amount = data.bankBalance;
  if (displays.length) {
    amount = displays.every((account) => account.amount !== null)
      ? displays.reduce((sum, account) => sum + BigInt(account.amount!), BigInt(0)).toString() : null;
  }
  return {
    amount,
    calculated: displays.some((account) => account.calculated)
  };
}
