import { authenticatedAPI } from '@/entities/session';
import type { BankAccountDraft } from '@/entities/banking';
import { ApiError } from '@/shared/api';

export type BankAccountSettings = Omit<BankAccountDraft, 'isPrimary'> & {
  propertyId: string;
  accountId: string;
  updatedAt: string;
};

/** 다른 관리대상의 응답이나 번호·버전이 손상된 응답은 편집 화면에 반영하지 않습니다. */
function readAccount(value: BankAccountSettings, propertyId: string) {
  if (!value || value.propertyId !== propertyId || !/^[0-9a-f-]{36}$/i.test(value.accountId)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || !['bankCode', 'bankName', 'holderName'].every((key) => typeof value[key as keyof BankAccountSettings] === 'string')
    || typeof value.accountNumber !== 'string' || !/^[0-9]{4,50}$/.test(value.accountNumber)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '계좌 정보를 확인하지 못했어요.');
  }
  return value;
}

/** 계좌 원문은 인증된 관리소장 조회에서만 읽고 브라우저 저장소에 보관하지 않습니다. */
export async function getBankAccount(propertyId: string) {
  return readAccount(await authenticatedAPI<BankAccountSettings>({
    url: `/api/properties/${propertyId}/banking/account`
  }), propertyId);
}

/** 조회 당시 계좌 ID·수정 시각을 함께 보내 다른 작업자의 변경을 덮어쓰지 않습니다. */
export async function correctBankAccount(propertyId: string, original: BankAccountSettings, draft: BankAccountDraft) {
  return readAccount(await authenticatedAPI<BankAccountSettings>({
    url: `/api/properties/${propertyId}/banking/account`,
    method: 'PUT',
    data: {
      accountId: original.accountId,
      updatedAt: original.updatedAt,
      bankCode: draft.bankCode,
      bankName: draft.bankName,
      accountNumber: draft.accountNumber,
      holderName: draft.holderName.trim()
    }
  }), propertyId);
}

export function bankAccountError(error: unknown) {
  const messages: Record<string, string> = {
    ACCESS_DENIED: '관리소장만 계좌 정보를 변경할 수 있어요.',
    BANK_ACCOUNT_CONFLICT: '다른 곳에서 계좌 정보가 변경됐어요. 닫았다가 다시 열어 최신 정보를 확인해주세요.',
    BANK_ACCOUNT_DUPLICATE: '같은 은행과 계좌번호가 이미 등록돼 있어요.',
    PAYMENT_ACCOUNT_UNAVAILABLE: '변경할 공용 기본 계좌를 확인하지 못했어요.',
    INVALID_REQUEST: '은행·계좌번호·예금주를 확인해주세요.'
  };

  return error instanceof ApiError ? messages[error.code] ?? '계좌 정보를 처리하지 못했어요. 다시 시도해주세요.' : '계좌 정보를 처리하지 못했어요. 다시 시도해주세요.';
}
