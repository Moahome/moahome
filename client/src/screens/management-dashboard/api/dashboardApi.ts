import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import { isValidDate } from '@/shared/lib/date-range';
import { isValidMonth } from '@/shared/lib/month-range';
import {
  readBankingBalances,
  readBankingWorkspace
} from '@/widgets/banking-workspace';
import { readPaymentLedger } from '@/widgets/payment-workspace';
import type { DashboardSnapshot } from './dashboardApiTypes';

/** 범위·기준시각·건수와 기존 원천 형식을 함께 검증해 잘못된 응답을 정상적인 0원으로 표시하지 않습니다. */
export function readDashboard(data: DashboardSnapshot, propertyId: string, month?: string): DashboardSnapshot {
  const counts = ['income', 'expenses', 'joinRequests', 'invitationChanges', 'external', 'duplicates'] as const;
  if (!data || data.propertyId !== propertyId || !isValidMonth(data.month) || (month !== undefined && data.month !== month)
    || typeof data.propertyName !== 'string' || !data.propertyName.trim() || !isValidDate(data.businessDate)
    || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt))
    || !data.tasks || !counts.every((key) => Number.isSafeInteger(data.tasks[key]) && data.tasks[key] >= 0)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '대시보드 자료를 확인할 수 없습니다.');
  }
  readBankingWorkspace(data.banking, propertyId);
  readBankingBalances(data.balances, propertyId, data.month);
  readPaymentLedger(data.payments, propertyId);
  if (data.banking.asOf !== data.businessDate || data.payments.asOf !== data.businessDate
    || data.banking.rows.some((row) => !row.date.startsWith(`${data.month}-`) || row.date > data.businessDate)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '대시보드 조회 범위를 확인할 수 없습니다.');
  }

  return data;
}

/** 월별 자료와 현재 업무를 한 요청으로 읽고 6개월 수납은 동일 원장 한 벌에서 계산합니다. */
export async function getDashboard(propertyId: string, month?: string, signal?: AbortSignal) {
  const data = await authenticatedAPI<DashboardSnapshot>({
    url: `/api/properties/${propertyId}/dashboard`,
    data: month ? {
      month
    } : undefined,
    signal
  });

  return readDashboard(data, propertyId, month);
}
