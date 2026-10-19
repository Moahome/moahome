import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  RegistrationRequest,
  RegistrationResult
} from './registrationApiTypes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 성공 표시와 결과 복원 모두 요청 ID·식별자·요약 계약을 확인하며 응답의 불필요한 필드를 저장하지 않습니다. */
export function readRegistrationResult(value: unknown, requestId: string): RegistrationResult {
  const result = value as RegistrationResult | null;
  const summary = result?.summary;
  if (!result || !UUID_PATTERN.test(requestId) || result.requestId !== requestId
    || !result.property || typeof result.property.id !== 'string' || !UUID_PATTERN.test(result.property.id)
    || typeof result.property.name !== 'string' || !result.property.name.trim() || Array.from(result.property.name).length > 50
    || typeof result.property.hasBuildings !== 'boolean' || result.property.status !== 'ACTIVE'
    || !result.membership || typeof result.membership.id !== 'string' || !UUID_PATTERN.test(result.membership.id)
    || result.membership.role !== 'ADMIN' || result.membership.status !== 'ACTIVE'
    || !summary || ![summary.buildingCount, summary.unitCount, summary.bankAccountCount, summary.feeItemCount]
    .every((count) => Number.isSafeInteger(count) && count >= 0)
    || summary.unitCount < 1 || summary.bankAccountCount < 1 || summary.feeItemCount < 1
    || !Number.isSafeInteger(summary.monthlyDefaultAmount) || Math.abs(summary.monthlyDefaultAmount) > 999999999999999
    || typeof result.createdAt !== 'string' || !Number.isFinite(Date.parse(result.createdAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '등록 결과를 확인할 수 없습니다.');
  }
  const start = result.managementStart;
  if (start !== undefined && (!start || typeof start.cutoffDate !== 'string'
    || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(start.cutoffDate)
    || typeof start.firstBillingMonth !== 'string' || !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(start.firstBillingMonth)
    || !(start.cashCutoffDate === null || (typeof start.cashCutoffDate === 'string' && /^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(start.cashCutoffDate))))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리 시작 결과를 확인할 수 없습니다.');
  }

  return {
    requestId,
    property: {
      id: result.property.id,
      name: result.property.name,
      hasBuildings: result.property.hasBuildings,
      status: 'ACTIVE'
    },
    membership: {
      id: result.membership.id,
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    summary: {
      buildingCount: summary.buildingCount,
      unitCount: summary.unitCount,
      bankAccountCount: summary.bankAccountCount,
      feeItemCount: summary.feeItemCount,
      monthlyDefaultAmount: summary.monthlyDefaultAmount
    },
    createdAt: result.createdAt,
    ...(result.managementStart ? {
      managementStart: {
        cutoffDate: result.managementStart.cutoffDate,
        firstBillingMonth: result.managementStart.firstBillingMonth,
        cashCutoffDate: result.managementStart.cashCutoffDate
      }
    } : {})
  };
}

/** 동일 ID·본문의 재시도는 서버의 중복 방지 계약을 사용하고 클라이언트에서 새 요청으로 바꾸지 않습니다. */
export async function submitRegistration(request: RegistrationRequest) {
  const result = await authenticatedAPI({
    url: '/api/property-registrations',
    method: 'POST',
    data: request
  });

  const parsed = readRegistrationResult(result, request.requestId);
  if (request.openingBalances && (!parsed.managementStart
    || parsed.managementStart.cutoffDate !== request.openingBalances.cutoffDate
    || parsed.managementStart.firstBillingMonth !== request.openingBalances.firstBillingMonth
    || parsed.managementStart.cashCutoffDate !== request.openingBalances.cashCutoffDate)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리 시작 결과를 확인할 수 없습니다.');
  }
  return parsed;
}

/** 통신 실패·새로고침·재로그인에서는 기존 요청의 성공 결과부터 확인합니다. */
export async function getRegistrationResult(requestId: string) {
  const result = await authenticatedAPI({
    url: `/api/property-registrations/${requestId}`
  });

  return readRegistrationResult(result, requestId);
}
