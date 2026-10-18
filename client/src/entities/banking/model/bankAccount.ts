import { getTextLength } from '@/shared/lib/format';
import { BANK_OPTIONS } from '../constants/bankOptions';

export interface BankAccountDraft {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  isPrimary: boolean;
}

export type BankAccountErrors = Partial<Record<keyof BankAccountDraft, string>>;

export const EMPTY_BANK_ACCOUNT: BankAccountDraft = {
  bankCode: '',
  bankName: '',
  accountNumber: '',
  holderName: '',
  isPrimary: true,
};

/** 계좌번호는 문자열로 유지하며 계약에서 허용한 공백·하이픈만 제거해 앞자리 0을 보존합니다. */
export function normalizeAccountNumber(value: string) {
  return value.trim().replace(/[ -]/g, '');
}

/** 실제 계좌 조회 없이 등록 계약의 필수값·문자 형식과 단일 계좌의 기본 지정을 확인합니다. */
export function getBankAccountErrors(draft: BankAccountDraft): BankAccountErrors {
  const errors: BankAccountErrors = {};
  const number = draft.accountNumber;

  const bank = BANK_OPTIONS.find((option) => option.value === draft.bankCode);

  if (!bank || bank.label !== draft.bankName) errors.bankCode = '은행을 선택해주세요.';
  if (!number) errors.accountNumber = '계좌번호를 입력해주세요.';
  else if (!/^[0-9]{4,50}$/.test(number)) {
    errors.accountNumber = '계좌번호는 숫자 4~50자리로 입력해주세요.';
  }
  if (getTextLength(draft.holderName) === 0) errors.holderName = '예금주를 입력해주세요.';
  if (getTextLength(draft.holderName) > 50) errors.holderName = '예금주는 50자 이내로 입력해주세요.';
  // 이 화면은 계좌 하나를 입력하므로 해당 계좌를 기본으로 지정해야 전체 기본 계좌 수가 하나가 됩니다.
  if (!draft.isPrimary) errors.isPrimary = '주민 납부 안내에 사용할 기본 관리계좌를 지정해주세요.';

  return errors;
}

/** 저장소의 이전 버전·손상된 계좌 입력을 안전하게 판별하고 업무 유효성은 폼에서 다시 확인합니다. */
export function isBankAccountDraft(value: unknown): value is BankAccountDraft {
  if (!value || typeof value !== 'object') return false;

  const account = value as BankAccountDraft;

  return ['bankCode', 'bankName', 'accountNumber', 'holderName'].every((field) => typeof account[field as keyof BankAccountDraft] === 'string')
    && typeof account.isPrimary === 'boolean';
}
