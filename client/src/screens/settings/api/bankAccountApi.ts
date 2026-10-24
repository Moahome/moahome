import type { BankAccountDraft } from '@/entities/banking';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  BankAccountSettings,
  ManagedBankAccount
} from './bankAccountApiTypes';

/** 다른 관리대상의 응답이나 번호·버전이 손상된 응답은 편집 화면에 반영하지 않습니다. */
function readAccount<T extends Omit<BankAccountSettings, 'alias'>>(value: T, propertyId: string) {
  if (!value || value.propertyId !== propertyId || !/^[0-9a-f-]{36}$/i.test(value.accountId)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || !['bankCode', 'bankName', 'holderName'].every((key) => typeof value[key as keyof T] === 'string')
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
    ACCESS_DENIED: '계좌 정보를 변경할 권한이 없어요.',
    BANK_ACCOUNT_CONFLICT: '다른 곳에서 계좌 정보가 변경됐어요. 닫았다가 다시 열어 최신 정보를 확인해주세요.',
    BANK_ACCOUNT_PRIMARY_REQUIRED: '다른 통장을 기본 납부계좌로 지정한 뒤 사용을 종료해주세요.',
    BANK_ACCOUNT_CLOSED: '사용 종료한 통장은 수정할 수 없어요.',
    BANK_ACCOUNT_DUPLICATE: '같은 은행과 계좌번호가 이미 등록돼 있어요.',
    PAYMENT_ACCOUNT_UNAVAILABLE: '변경할 공용 기본 계좌를 확인하지 못했어요.',
    INVALID_REQUEST: '은행·계좌번호·예금주를 확인해주세요.'
  };

  return error instanceof ApiError ? messages[error.code] ?? '계좌 정보를 처리하지 못했어요. 다시 시도해주세요.' : '계좌 정보를 처리하지 못했어요. 다시 시도해주세요.';
}

/** 통장 목록 원문은 설정을 열었을 때만 조회하며 종료 통장도 과거 내역 확인을 위해 유지합니다. */
export async function getBankAccounts(propertyId: string) {
  const rows = await authenticatedAPI<ManagedBankAccount[]>({
    url: `/api/properties/${propertyId}/banking/account/list`
  });
  if (!Array.isArray(rows) || !rows.every((row) => readAccount(row, propertyId) && typeof row.isPrimary === 'boolean'
    && ['ACTIVE', 'INACTIVE', 'CLOSED'].includes(row.status) && (row.alias === null || typeof row.alias === 'string'))
    || new Set(rows.map((row) => row.accountId)).size !== rows.length) throw new ApiError(200, 'INVALID_RESPONSE', '관리계좌 목록을 확인하지 못했어요.');
  return rows;
}

/** 기본 계좌의 조회 당시 ID도 보내 다른 관리자의 기본 전환을 오래된 화면에서 덮어쓰지 않습니다. */
export async function saveBankAccount(propertyId: string, id: string, original: ManagedBankAccount | null, draft: BankAccountDraft, primaryAccountId: string) {
  return authenticatedAPI<ManagedBankAccount>({
    url: `/api/properties/${propertyId}/banking/account/save`,
    method: 'POST',
    data: {
      accountId: id,
      updatedAt: original?.updatedAt ?? null,
      primaryAccountId,
      bankCode: draft.bankCode,
      bankName: draft.bankName,
      accountNumber: draft.accountNumber,
      holderName: draft.holderName.trim(),
      alias: draft.alias?.trim() || null,
      isPrimary: draft.isPrimary
    }
  });
}

export async function closeBankAccount(propertyId: string, account: ManagedBankAccount) {
  return authenticatedAPI<ManagedBankAccount>({
    url: `/api/properties/${propertyId}/banking/account/${account.accountId}/close`,
    method: 'POST',
    data: {
      updatedAt: account.updatedAt
    }
  });
}
