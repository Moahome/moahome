import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  InitialBalanceHistory,
  InitialBalanceInput,
  OpeningBatch,
  OpeningInput,
  OpeningUnit,
  OpeningWorkspace
} from './openingBalanceApiTypes';

const AMOUNT = /^[0-9]{1,15}$/;
const SIGNED_AMOUNT = /^-?[0-9]{1,15}$/;
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

/** 불완전한 정정 이력이 화면에 섞이지 않도록 대상·전후 날짜와 금액을 검증합니다. */
function validHistory(row: InitialBalanceHistory) {
  return row && isPropertyId(row.id) && ['HANDOVER', 'BUILDING', 'ACCOUNT'].includes(row.kind)
    && (row.previousDate === null || isDate(row.previousDate)) && (row.newDate === null || isDate(row.newDate))
    && typeof row.reason === 'string' && isPropertyId(row.changedBy) && typeof row.changedByName === 'string'
    && Number.isFinite(Date.parse(row.changedAt)) && Array.isArray(row.details)
    && row.details.every((part) => part && isPropertyId(part.targetId) && typeof part.label === 'string'
      && (part.previousDate === null || isDate(part.previousDate)) && (part.newDate === null || isDate(part.newDate))
      && (part.previousAmount === null || (typeof part.previousAmount === 'string' && SIGNED_AMOUNT.test(part.previousAmount)))
      && (part.newAmount === null || (typeof part.newAmount === 'string' && SIGNED_AMOUNT.test(part.newAmount))));
}
function read(value: OpeningWorkspace, property: string) {
  if (!value || value.propertyId !== property || !Array.isArray(value.units) || !Array.isArray(value.accounts)
    || typeof value.managementStarted !== 'boolean' || !Number.isFinite(Date.parse(value.asOf))
    || !Array.isArray(value.history)
    || !(value.correctionDeadline === undefined || value.correctionDeadline === null || isDate(value.correctionDeadline))
    || !(value.initialCorrectionAllowed === undefined || typeof value.initialCorrectionAllowed === 'boolean')
    || !(value.corrections === undefined || (Array.isArray(value.corrections) && value.corrections.every(validHistory)))
    || value.units.some((u) => !isPropertyId(u.unitId) || typeof u.label !== 'string' || !AMOUNT.test(u.receivable) || !AMOUNT.test(u.credit)
      || !(u.buildingId === undefined || u.buildingId === null || isPropertyId(u.buildingId))
      || !(u.buildingName === undefined || u.buildingName === null || typeof u.buildingName === 'string'))
    || value.accounts.some((a) => !isPropertyId(a.accountId) || typeof a.label !== 'string' || !AMOUNT.test(a.amount)
      || !(a.bankCode === undefined || typeof a.bankCode === 'string')
      || !(a.initialBalance === undefined || typeof a.initialBalance === 'boolean'))
    || (value.batch && (!isPropertyId(value.batch.id) || !Number.isSafeInteger(value.batch.revision)
      || !['DRAFT', 'CONFIRMED', 'CANCELED'].includes(value.batch.status)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '잔액 인계 응답을 확인할 수 없습니다.');
  }

  return value;
}
export async function getOpeningBalances(property: string, signal?: AbortSignal) {
  return read(await authenticatedAPI<OpeningWorkspace>({
    signal,
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
/** 초기 설정값만 정정하며 사유·조회 버전·요청 ID로 감사 이력과 중복 저장 방지를 연결합니다. */
export async function correctInitialBalances(property: string, batchId: string, input: InitialBalanceInput) {
  return read(await authenticatedAPI<OpeningWorkspace>({
    url: `/api/properties/${property}/billing/opening-balances/${batchId}/initial-corrections`,
    method: 'POST',
    data: input
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
    INITIAL_BALANCE_LOCKED: '초기 기준 정정 기간이 지났어요. 시작 금액과 기준일은 잠겨 있습니다.',
    INITIAL_BALANCE_CONFLICT: '초기 기준이 변경됐어요. 최신 값을 불러와 다시 확인해주세요.',
    INITIAL_BALANCE_USE_BANK_CORRECTION: '통장 관리의 초기 잔액 정정에서 날짜와 동별 보유금을 함께 변경해주세요.',
    INITIAL_BILLING_CONFIRMATION_REQUIRED: '부과 변경 내역을 다시 확인하고 동의해주세요.',
    INITIAL_BILLING_HAS_RECEIPTS: '확정 수납이 있어 부과 시작월을 변경할 수 없어요.',
    INITIAL_BILLING_HAS_APPLICATIONS: '이미 충당한 인계 선납이 있어 부과 시작월을 변경할 수 없어요.',
    INITIAL_BILLING_HAS_CHARGES: '이미 부과한 월을 제외하도록 기준일을 변경할 수 없어요.',
    INITIAL_BALANCE_TRANSACTION_CONFLICT: '변경할 기준일 사이에 등록된 거래가 있어요. 거래 반영 범위를 바꾸는 정정은 할 수 없습니다.',
    INVALID_INITIAL_BALANCE_DATE: '기준일은 오늘까지이며 첫 부과월과 기존 미납 발생월을 확인해주세요.',
    OPENING_BALANCE_CONFLICT: '인계 상태가 변경됐거나 기존 운영 대상이에요. 최신 정보를 확인해주세요.',
    OPENING_TARGETS_CHANGED: '세대 또는 관리계좌가 변경됐어요. 최신 목록을 불러와 다시 확인해주세요.',
    OPENING_ALREADY_HAS_RECEIPTS: '확정 수납이 있어 인계 잔액을 변경할 수 없어요. 관련 수납부터 정리해주세요.',
    INVALID_OPENING_DATES: '기준일은 오늘까지, 첫 부과월은 기준일 이후부터 다음 달까지 선택해주세요.',
    INVALID_OPENING_FILE: '내려받은 .xlsx 양식과 금액을 확인해주세요. 수식은 사용할 수 없어요.',
    ACCESS_DENIED: '기존 잔액 인계를 처리할 권한이 없어요.',
    INVALID_REQUEST: '기준일, 첫 부과월과 세대·계좌 금액을 확인해주세요.'
  };

  return messages[error.code] ?? '잔액 인계를 처리하지 못했어요. 최신 정보를 확인해주세요.';
}

