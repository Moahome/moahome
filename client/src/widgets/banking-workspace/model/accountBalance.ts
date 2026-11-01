import type {
  AccountBalance,
  BalanceWorkspace
} from '../api/bankingBalanceApiTypes';
import { formatWon } from '@/shared/lib/format';

/** 수동 입출금을 반영한 장부 잔액만 표시하며, 과거 은행 확인값으로 미설정 장부를 대체하지 않습니다. */
export function getAccountBalanceDisplay(account: AccountBalance) {
  if (account.calculatedBalance != null && account.calculationBasisDate) return {
    amount: account.calculatedBalance,
    calculated: true,
    description: `${account.calculationBasisDate} 초기 잔액 기준 · 등록 입출금 반영`
  };

  return {
    amount: null,
    calculated: false,
    description: '통장 초기 잔액 설정 필요'
  };
}

/** 마지막 은행 확인값은 장부와 분리해 출처·시점과 함께 보여주며, 자료 충돌을 정상 확인으로 표현하지 않습니다. */
export function getBankConfirmationDescription(account: AccountBalance) {
  if (account.confirmation?.status === 'ORDER_UNCLEAR') return '은행 확인 자료의 순서를 확인해주세요.';
  if (account.confirmation?.status === 'BALANCE_MISSING') return '최근 은행 거래에 잔액이 제공되지 않았습니다.';
  if (account.balance === null) return '은행 확인 기록 없음 · 확인은 선택 사항입니다.';
  let source = '';
  if (account.confirmation?.source === 'BANK_IMPORT') source = ' · 엑셀 거래내역';
  if (account.confirmation?.source === 'DIRECT_CHECK') {
    source = ' · 직접 확인';
    if (account.confirmation.method === 'BANK_APP') source = ' · 은행 앱에서 직접 확인';
    if (account.confirmation.method === 'INTERNET_BANKING') source = ' · 인터넷뱅킹에서 확인';
  }

  return `마지막 은행 확인: ${formatWon(account.balance)}${account.asOf ? ` · ${account.asOf}` : ''}${source}`;
}

/** 같은 조회 월·통장 범위의 장부 잔액을 합산하며, 한 통장이라도 초기 금액이 없으면 합계를 확정하지 않습니다. */
export function getAccountBalanceTotal(data: BalanceWorkspace) {
  const accounts = data.accountId ? data.accounts?.filter((account) => account.id === data.accountId) : data.accounts;
  const displays = accounts?.map(getAccountBalanceDisplay) ?? [];
  const complete = displays.length > 0 && displays.every((account) => account.amount !== null);

  return {
    amount: complete ? displays.reduce((sum, account) => sum + BigInt(account.amount!), BigInt(0)).toString() : null,
    calculated: complete
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
