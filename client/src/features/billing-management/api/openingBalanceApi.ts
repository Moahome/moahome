import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  OpeningBatch,
  OpeningInput,
  OpeningUnit,
  OpeningWorkspace
} from './openingBalanceApiTypes';

const AMOUNT = /^[0-9]{1,15}$/;
function read(value: OpeningWorkspace, property: string) {
  if (!value || value.propertyId !== property || !Array.isArray(value.units) || !Array.isArray(value.accounts)
    || typeof value.managementStarted !== 'boolean' || !Number.isFinite(Date.parse(value.asOf))
    || !Array.isArray(value.history)
    || value.units.some((u) => !isPropertyId(u.unitId) || typeof u.label !== 'string' || !AMOUNT.test(u.receivable) || !AMOUNT.test(u.credit))
    || value.accounts.some((a) => !isPropertyId(a.accountId) || typeof a.label !== 'string' || !AMOUNT.test(a.amount))
    || (value.batch && (!isPropertyId(value.batch.id) || !Number.isSafeInteger(value.batch.revision)
      || !['DRAFT', 'CONFIRMED', 'CANCELED'].includes(value.batch.status)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '잔액 인계 응답을 확인할 수 없습니다.');
  }

  return value;
}
export async function getOpeningBalances(property: string) {
  return read(await authenticatedAPI<OpeningWorkspace>({
    url: `/api/properties/${property}/billing/opening-balances`
  }), property);
}
export async function saveOpeningBalances(property: string, input: OpeningInput) {
  return read(await authenticatedAPI<OpeningWorkspace>({
    url: `/api/properties/${property}/billing/opening-balances`,
    method: 'PUT',
    data: input
  }), property);
}
export async function changeOpeningBalances(property: string, batch: OpeningBatch, action: 'confirm' | 'cancel', reason?: string) {
  return read(await authenticatedAPI<OpeningWorkspace>({
    url: `/api/properties/${property}/billing/opening-balances/${batch.id}/${action}`,
    method: 'POST',
    data: {
      revision: batch.revision,
      ...(reason ? {
        reason
      } : {})
    }
  }), property);
}
export async function previewOpeningExcel(property: string, file: File) {
  const data = new FormData(); data.append('file', file);
  const result = await authenticatedAPI<Omit<OpeningUnit, 'label'>[]>({
    url: `/api/properties/${property}/billing/opening-balances/import/preview`,
    method: 'POST',
    data
  });
  if (!Array.isArray(result) || result.some((u) => !isPropertyId(u.unitId) || !AMOUNT.test(u.receivable) || !AMOUNT.test(u.credit))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '엑셀 검증 결과를 확인할 수 없습니다.');
  }

  return result;
}
export function openingBalanceError(error: unknown) {
  if (!(error instanceof ApiError)) return '잔액 인계를 처리하지 못했어요. 입력을 유지하고 다시 시도해주세요.';
  const messages: Record<string, string> = {
    OPENING_BALANCE_CONFLICT: '인계 상태가 변경됐거나 기존 운영 대상이에요. 최신 정보를 확인해주세요.',
    OPENING_TARGETS_CHANGED: '세대 또는 관리계좌가 변경됐어요. 최신 목록을 불러와 다시 확인해주세요.',
    OPENING_ALREADY_HAS_RECEIPTS: '확정 수납이 있어 인계 잔액을 변경할 수 없어요. 관련 수납부터 정리해주세요.',
    INVALID_OPENING_DATES: '기준일은 오늘까지, 첫 부과월은 기준일 이후부터 다음 달까지 선택해주세요.',
    INVALID_OPENING_FILE: '내려받은 .xlsx 양식과 금액을 확인해주세요. 수식은 사용할 수 없어요.',
    ACCESS_DENIED: '기존 잔액 인계는 관리소장만 할 수 있어요.',
    INVALID_REQUEST: '기준일, 첫 부과월과 세대·계좌 금액을 확인해주세요.'
  };

  return messages[error.code] ?? '잔액 인계를 처리하지 못했어요. 최신 정보를 확인해주세요.';
}

