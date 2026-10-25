import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  BankBalanceCheck,
  BankBalanceCheckHistory,
  BankBalanceCheckInput
} from './bankingBalanceApiTypes';

/** 다른 관리대상·통장 응답과 잘못된 금액을 거부하고 취소한 확인 원문도 보존합니다. */
export async function getBankBalanceChecks(propertyId: string, accountId: string, signal?: AbortSignal): Promise<BankBalanceCheck[]> {
  const data = await authenticatedAPI<BankBalanceCheckHistory>({
    signal,
    url: `/api/properties/${propertyId}/banking/balances/checks`,
    data: {
      accountId
    }
  });
  if (data?.propertyId !== propertyId || data.accountId !== accountId || !Array.isArray(data.checks)
    || data.checks.some((row) => typeof row.id !== 'string' || !/^[0-9]{1,15}$/.test(row.amount)
      || !Number.isFinite(Date.parse(row.checkedAt)) || !Number.isFinite(Date.parse(row.createdAt))
      || !['BANK_APP', 'INTERNET_BANKING', 'OTHER'].includes(row.sourceType)
      || typeof row.checkedBy !== 'string' || !(row.memo === null || typeof row.memo === 'string')
      || !(row.canceledAt === null || Number.isFinite(Date.parse(row.canceledAt)))
      || !(row.cancelReason === null || typeof row.cancelReason === 'string'))) throw new ApiError(200, 'INVALID_RESPONSE', '잔액 확인 이력을 확인할 수 없습니다.');
  return data.checks;
}

/** 같은 요청 ID의 재시도는 서버에서 원문을 대조해 중복 생성하지 않습니다. */
export async function saveBankBalanceCheck(propertyId: string, input: BankBalanceCheckInput) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/checks`,
    method: 'POST',
    data: input
  });
}

/** 확인 원문을 지우지 않고 명시적인 사유와 요청 ID로 취소합니다. */
export async function cancelBankBalanceCheck(propertyId: string, checkId: string, id: string, reason: string) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/checks/${checkId}/cancel`,
    method: 'POST',
    data: {
      id,
      reason
    }
  });
}
