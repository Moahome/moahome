import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import {
  readBankingBalances,
  readBankingWorkspace
} from '@/widgets/banking-workspace';
import { readPaymentLedger } from '@/widgets/payment-workspace';
import type { MonthlySettlementSnapshot } from './monthlySettlementApiTypes';

/** 서버의 동일 스냅샷을 기존 업무별 검증기로 확인하며 일부 실패를 빈 자료나 0원으로 바꾸지 않습니다. */
export async function getMonthlySettlement(propertyId: string, month?: string, signal?: AbortSignal): Promise<MonthlySettlementSnapshot> {
  const data = await authenticatedAPI<MonthlySettlementSnapshot>({
    signal,
    url: `/api/properties/${propertyId}/closing/monthly`,
    data: month ? {
      month
    } : undefined
  });
  if (data?.propertyId !== propertyId || !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(data.month)
    || (month !== undefined && data.month !== month) || typeof data.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(data.generatedAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '월별 정산 자료를 확인할 수 없습니다.');
  }
  readBankingWorkspace(data.banking, propertyId);
  readBankingBalances(data.balances, propertyId, data.month);
  readPaymentLedger(data.payments, propertyId);
  return data;
}
