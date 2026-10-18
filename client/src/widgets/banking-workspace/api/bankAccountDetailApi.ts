import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export interface BankAccountDetail {
  propertyId: string;
  accountId: string;
  updatedAt: string;
  bankCode: string;
  bankName: string;
  last4: string;
  holderName: string;
  alias: string | null;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
}

/** 마스킹 상세에 원문이 섞이거나 다른 통장의 응답이 도착하면 조회 캐시에 넣지 않습니다. */
export async function getBankAccountDetail(propertyId: string, accountId: string): Promise<BankAccountDetail> {
  const result = await authenticatedAPI<BankAccountDetail>({
    url: `/api/properties/${propertyId}/banking/account/${accountId}`
  });
  if (!result || result.propertyId !== propertyId || result.accountId !== accountId
    || typeof result.updatedAt !== 'string' || !Number.isFinite(Date.parse(result.updatedAt))
    || !['bankCode', 'bankName', 'holderName'].every((key) => typeof result[key as keyof BankAccountDetail] === 'string' && String(result[key as keyof BankAccountDetail]).trim())
    || typeof result.last4 !== 'string' || !/^[0-9]{4}$/.test(result.last4)
    || !(result.alias === null || typeof result.alias === 'string') || typeof result.isPrimary !== 'boolean'
    || !['ACTIVE', 'INACTIVE', 'CLOSED'].includes(result.status)
    || ['accountNumber', 'accountNumberEncrypted', 'accountNumberHmac'].some((key) => Object.hasOwn(result, key))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '통장 정보를 확인하지 못했어요.');
  }

  return result;
}

/** 공개 시에만 선택 통장 원문을 읽으며 상세 정정 이후의 다른 버전 번호는 함께 표시하지 않습니다. */
export async function revealBankAccountNumber(account: BankAccountDetail): Promise<string> {
  const result = await authenticatedAPI<{ propertyId: string; accountId: string; updatedAt: string; accountNumber: string }>({
    url: `/api/properties/${account.propertyId}/banking/account/${account.accountId}/number-reveal`,
    method: 'POST'
  });
  if (!result || result.propertyId !== account.propertyId || result.accountId !== account.accountId
    || result.updatedAt !== account.updatedAt || typeof result.accountNumber !== 'string'
    || !/^[0-9]{4,50}$/.test(result.accountNumber) || !result.accountNumber.endsWith(account.last4)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '통장 정보를 다시 조회한 뒤 계좌번호를 확인해주세요.');
  }

  return result.accountNumber;
}
