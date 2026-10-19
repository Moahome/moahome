export {
  EMPTY_BANK_ACCOUNT,
  getBankAccountErrors,
  isBankAccountDraft,
  normalizeAccountNumber
} from '@/entities/banking';

import {
  EMPTY_BANK_ACCOUNT,
  getBankAccountErrors
} from '@/entities/banking';
import type { RegistrationAccount } from './bankAccountTypes';

/** 통장은 용도·개수 제한 없이 추가하되 기준일 잔액을 임의로 0원 확정하지 않습니다. */
export function createRegistrationAccount(clientId: string, isPrimary = false): RegistrationAccount {
  return {
    ...EMPTY_BANK_ACCOUNT,
    isPrimary,
    clientId,
    openingAmount: ''
  };
}

/** 계좌별 형식·중복과 목록 전체의 기본 납부계좌 정확히 1개 지정을 함께 확인합니다. */
export function getRegistrationAccountsError(accounts: RegistrationAccount[]) {
  if (!accounts.length) return '관리계좌를 하나 이상 등록해주세요.';
  if (accounts.some((account) => Object.keys(getBankAccountErrors(account)).length)) return '각 통장의 은행·계좌번호·예금주를 확인해주세요.';
  if (accounts.filter((account) => account.isPrimary).length !== 1) return '기본 납부계좌를 하나 선택해주세요.';
  if (new Set(accounts.map((account) => `${account.bankCode}:${account.accountNumber}`)).size !== accounts.length) return '같은 은행과 계좌번호가 중복돼 있어요.';
  return '';
}
