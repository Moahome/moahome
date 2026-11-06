import type {
  AccountBalance,
  BalanceWorkspace
} from '../api/bankingBalanceApiTypes';

/** 현재 통장 금액은 장부 계산값으로만 표시하고 은행 확인 기록을 현재 잔액으로 대체하지 않습니다. */
export function getAccountBalanceDisplay(account: AccountBalance) {
  if (account.calculatedBalance != null && account.calculationBasisDate) return {
    amount: account.calculatedBalance,
    calculated: true,
    label: '현재 장부 잔액',
    description: account.calculationSource === 'BANK_CONFIRMATION_TRANSFER' || account.calculationSource === 'LATEST_BALANCE' || account.calculationSource === 'TRANSACTION_LEDGER' ? `${account.calculationBasisDate} 거래 원장 기준 · 이후 입출금 반영` : `${account.calculationBasisDate} 초기 잔액 기준 · 등록 입출금 반영`
  };

  return {
    amount: null,
    calculated: false,
    label: '잔액 계산 확인 필요',
    description: '거래 원장의 시작 금액과 누락 거래를 확인해주세요.'
  };

}

/** 같은 조회 범위의 장부값만 합산하며 계산하지 못한 통장을 은행 참고값이나 0원으로 채우지 않습니다. */
export function getAccountBalanceTotal(data: BalanceWorkspace) {
  const accounts = data.accountId ? data.accounts?.filter((account) => account.id === data.accountId) : data.accounts;
  const displays = accounts?.map(getAccountBalanceDisplay) ?? [];
  const complete = displays.length > 0 && displays.every((account) => account.amount !== null);

  return {
    amount: complete ? displays.reduce((sum, account) => sum + BigInt(account.amount!), BigInt(0)).toString() : null,
    calculated: complete && displays.every((account) => account.calculated)
  };
}

/** 진행 중인 달을 월말 확정액으로 오해하지 않도록 선택 월의 등록 내역 기준으로 설명합니다. */
export function getBalancePeriodLabel(month: string) {
  const [year, monthNumber] = month.split('-');

  return `${year}년 ${Number(monthNumber)}월 등록 내역 기준`;
}

/** 조회 중인 통장과 동별 귀속의 범위를 일치시키고 누락된 동별 금액을 0원으로 채우지 않습니다. */
export function getAccountBuildingBalance(data: BalanceWorkspace, accountId: string) {
  if (!data.buildings.length) return null;
  const scoped = data.accountId === accountId || (!data.accountId && data.accounts?.length === 1 && data.accounts[0].id === accountId);
  const amounts = data.buildings.flatMap((building) => {
    if (scoped) return [building.balance];
    const own = building.accountBalances?.find((row) => row.accountId === accountId);
    if (!own && !building.active) return [];

    return [own?.balance ?? null];
  });
  if (!amounts.length || amounts.some((amount) => amount === null)) return null;

  return amounts.reduce((sum, amount) => sum + BigInt(amount!), BigInt(0)).toString();
}
