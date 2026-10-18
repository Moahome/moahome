import type { ExpenseDraft } from '@/entities/banking';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import {
  isPreviewDate,
  type PreviewLedger,
  type PreviewPayment,
  type CumulativePaymentDraft
} from '../model/paymentPreview';

export type PaymentCommand =
  | { type: 'manual'; data: { id: string; unitId?: string; date: string; amount: string; accountId?: string; purpose?: 'HOUSEHOLD' | 'OTHER' | 'SHARED'; payer?: string; category?: string; note?: string; incomeAllocation?: ExpenseDraft } }
  | { type: 'confirm'; id: string; data: CumulativePaymentDraft }
  | { type: 'other-income'; id: string; data: { category: string; note?: string } }
  | { type: 'hold' | 'cancel'; id: string; data: { reason: string } }
  | { type: 'confirm-matches' }
  | { type: 'delete'; id: string }
  | { type: 'delete-many'; data: { paymentIds: string[] } }
  | { type: 'resume'; id: string }
  | { type: 'link'; id: string; data: { paymentId: string } }
  | { type: 'import'; file: File; transactionIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT = /^-?[0-9]{1,15}$/;
const STATES = ['PENDING', 'ON_HOLD', 'CONFIRMED', 'CANCELED', 'LINKED'];

/** 다른 관리대상의 응답·숫자 정밀도 손실·잘못된 참조를 화면 원장으로 받아들이지 않습니다. */
function readLedger(value: PreviewLedger & { propertyId: string }, propertyId: string): PreviewLedger {
  if (!value || value.propertyId !== propertyId || !isPreviewDate(value.asOf)
    || !Array.isArray(value.accounts) || !value.accounts.every((a) => UUID.test(a.id) && typeof a.label === 'string')
    || (value.buildings !== undefined && (!Array.isArray(value.buildings) || !value.buildings.every((b) => UUID.test(b.id) && typeof b.label === 'string')))
    || !Array.isArray(value.units) || !value.units.every((u) => UUID.test(u.id) && typeof u.label === 'string' && ['ACTIVE', 'VACANT'].includes(u.status)
      && (u.buildingName === undefined || typeof u.buildingName === 'string')
      && (u.residentNames === undefined || (Array.isArray(u.residentNames) && u.residentNames.every((name) => typeof name === 'string'))))
    || !Array.isArray(value.charges) || !value.charges.every((c) => UUID.test(c.id) && UUID.test(c.unitId) && typeof c.amount === 'string' && AMOUNT.test(c.amount)
      && (c.chargeType === undefined || ['MONTHLY', 'OPENING_RECEIVABLE'].includes(c.chargeType))
      && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(c.month) && ['ISSUED', 'CANCELED', 'EXCLUDED_VACANT'].includes(c.status))
    || !Array.isArray(value.payments) || !value.payments.every((p) => UUID.test(p.id) && UUID.test(p.accountId) && (p.unitId === '' || UUID.test(p.unitId))
      && typeof p.payer === 'string' && typeof p.amount === 'string' && /^[0-9]{1,15}$/.test(p.amount) && BigInt(p.amount) > BigInt(0)
      && isPreviewDate(p.date) && ['MANUAL', 'BANK_IMPORT'].includes(p.source) && STATES.includes(p.status)
      && (p.receiptType === undefined || ['HOUSEHOLD', 'OTHER'].includes(p.receiptType))
      && (p.receiptType !== 'OTHER' || (['CONFIRMED', 'CANCELED'].includes(p.status)
        && p.unitId === '' && p.allocations?.length === 0 && typeof p.incomeCategory === 'string' && Boolean(p.incomeCategory.trim())))
      && (p.incomeAllocation == null || (p.receiptType === 'OTHER' && UUID.test(p.incomeAllocation.id)
        && ['EQUAL', 'RATIO', 'AMOUNT'].includes(p.incomeAllocation.mode) && Array.isArray(p.incomeAllocation.allocations)
        && p.incomeAllocation.allocations.length > 0 && p.incomeAllocation.allocations.every((a) => UUID.test(a.buildingId ?? '') && typeof a.label === 'string' && /^[0-9]{1,15}$/.test(a.amount) && BigInt(a.amount) > BigInt(0))
        && p.incomeAllocation.allocations.reduce((sum, a) => sum + BigInt(a.amount), BigInt(0)) === BigInt(p.amount)))
      && (p.incomeNote === undefined || p.incomeNote === null || typeof p.incomeNote === 'string')
      && Array.isArray(p.allocations) && p.allocations.every((a) => UUID.test(a.chargeId) && /^[0-9]{1,15}$/.test(a.amount)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '입금 응답을 확인할 수 없습니다.');
  }
  if (value.openingCredits !== undefined && (!Array.isArray(value.openingCredits) || value.openingCredits.some((credit) => !UUID.test(credit.id)
    || !UUID.test(credit.unitId) || !isPreviewDate(credit.date) || !/^[0-9]{1,15}$/.test(credit.amount)
    || !Array.isArray(credit.allocations) || credit.allocations.some((a) => !UUID.test(a.chargeId) || !/^[0-9]{1,15}$/.test(a.amount))))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '기존 선납 응답을 확인할 수 없습니다.');
  }
  const ids = new Set(value.units.map((u) => u.id));
  if (value.charges.some((c) => !ids.has(c.unitId)) || value.payments.some((p) => p.unitId && !ids.has(p.unitId))
    || value.openingCredits?.some((c) => !ids.has(c.unitId))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '입금 응답을 확인할 수 없습니다.');
  }
  return value;
}
export async function getPaymentLedger(propertyId: string): Promise<PreviewLedger> {
  return readLedger(await authenticatedAPI({
    url: `/api/properties/${propertyId}/payments/workspace`
  }), propertyId);
}
/** 변경 결과는 서버가 저장·검증한 원장으로 교체하고 브라우저 계산 결과를 저장값으로 사용하지 않습니다. */
export async function mutatePayment(propertyId: string, command: PaymentCommand): Promise<PreviewLedger> {
  const path = `/api/properties/${propertyId}/payments`;
  if (command.type === 'import') {
    const data = new FormData(); data.append('file', command.file);
    data.append('selection', new Blob([JSON.stringify({
      transactionIds: command.transactionIds
    })], {
      type: 'application/json'
    }));
    return readLedger(await authenticatedAPI({
      url: `${path}/import`,
      method: 'POST',
      data,
      timeoutMs: 60_000
    }), propertyId);
  }
  let url = path;
  if (command.type === 'delete-many') url += '/delete';
  else if (command.type === 'delete') url += `/${command.id}`;
  else if (command.type === 'confirm-matches' || command.type === 'manual') url += `/${command.type}`;
  else url += `/${command.id}/${command.type}`;
  const data = 'data' in command ? command.data : undefined;
  return readLedger(await authenticatedAPI({
    url,
    method: command.type === 'delete' ? 'DELETE' : 'POST',
    data
  }), propertyId);
}
/** 미리보기와 실제 가져오기 모두 서버에서 원본 파일을 검증해 조작된 행 데이터로 저장하지 않습니다. */
export async function previewBankFile(propertyId: string, file: File): Promise<{ rows: PreviewPayment[]; duplicateCount: number }> {
  const data = new FormData(); data.append('file', file);
  const result = await authenticatedAPI<{ propertyId: string; rows: PreviewPayment[]; duplicateCount: number }>({
    url: `/api/properties/${propertyId}/payments/import/preview`,
    method: 'POST',
    data,
    timeoutMs: 60_000
  });
  if (!result || result.propertyId !== propertyId || !Number.isInteger(result.duplicateCount) || result.duplicateCount < 0
    || !Array.isArray(result.rows) || result.rows.length > 5000 || !result.rows.every((row) => row && UUID.test(row.id)
      && UUID.test(row.accountId) && typeof row.payer === 'string' && isPreviewDate(row.date) && /^[0-9]{1,15}$/.test(row.amount))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '은행 거래 응답을 확인할 수 없습니다.');
  }
  return result;
}

export function paymentError(error: unknown): string {
  if (!(error instanceof ApiError)) return '입금 정보를 처리하지 못했어요.';
  const messages: Record<string, string> = {
    OPENING_BALANCE_REQUIRED: '관리비 부과의 기존 잔액 인계에서 관리 시작을 먼저 확정해주세요.',
    PAYMENT_BEFORE_OPENING_CUTOFF: '기존 장부 기준일 이전 입금은 인계 잔액에 포함되어 신규 수납으로 반영할 수 없어요.',
    ACCESS_DENIED: '입금 관리는 현재 관리소장만 사용할 수 있어요.',
    PAYMENT_REPRESENTATIVE_REQUIRED: '선택한 세대에 현재 대표 주민을 먼저 등록해주세요.',
    PAYMENT_UNIT_UNAVAILABLE: '사용 중인 세대와 현재 대표 주민을 확인해주세요.',
    PAYMENT_ACCOUNT_UNAVAILABLE: '등록된 공용 기본 관리계좌를 확인해주세요.',
    PAYMENT_ALLOCATION_INVALID: '청구 잔액이 변경됐거나 반영할 수 없는 청구가 포함됐어요. 최신 금액을 확인해주세요.',
    PAYMENT_DUPLICATE_REVIEW_REQUIRED: '같은 수동 수납이 있어요. 기존 수납에 연결하거나 별도 입금 사유를 입력해주세요.',
    PAYMENT_REQUEST_CONFLICT: '이미 처리한 요청과 내용이 달라요. 최신 내역을 확인해주세요.',
    PAYMENT_STATE_CONFLICT: '입금 상태가 변경됐어요. 최신 내역을 확인해주세요.',
    PAYMENT_LINK_CONFLICT: '연결할 수 없어요. 계좌·입금일·금액·세대와 기존 연결 여부를 확인해주세요.',
    PAYMENT_DELETE_NOT_ALLOWED: '확정 수납은 먼저 취소해주세요. 은행 미연결 수동 입금은 취소 후 삭제할 수 있어요.',
    PAYMENT_NOT_FOUND: '입금 내역을 찾을 수 없어요.',
    INVALID_AMOUNT: '금액은 1~999,999,999,999,999원으로 입력해주세요.',
    INVALID_INCOME_CATEGORY: '입금 항목은 100자 이내, 메모는 500자 이내로 입력해주세요.',
    INVALID_PAYMENT_DATE: '입금일은 오늘까지의 실제 날짜로 입력해주세요.',
    INVALID_BANK_FILE: '.xls·.xlsx 또는 UTF-8 CSV 파일을 확인해주세요. 최대 5MB이며 수식은 지원하지 않아요.',
    INVALID_BANK_HEADER: '앞부분의 거래일·입금액·입금자명 열을 확인해주세요. 입출금 양식은 적요 열도 사용할 수 있어요.',
    INVALID_BANK_ROW: '거래내역의 날짜·입금자·금액 또는 수식 셀을 확인해주세요.',
    INVALID_BANK_SELECTION: '입금 용도에 맞는 세대·입금자명·입금 항목과 배분 설정을 확인해주세요.',
    INVALID_EXPENSE_TARGET: '현재 관리 중인 동을 선택해주세요.',
    INVALID_EXPENSE_ALLOCATION: '배분할 동과 0원보다 큰 금액·비율을 확인해주세요.',
    EXPENSE_ALLOCATION_MISMATCH: '배분액 합계와 입금액을 맞춰주세요.',
    ALLOCATION_REMAINDER_REQUIRED: '원 미만 금액이 남습니다. 금액 직접 입력으로 조정해주세요.',
    BANK_REQUEST_CONFLICT: '이미 저장한 배분과 내용이 달라요. 최신 내역을 확인해주세요.',
    BANK_ROW_LIMIT: '거래내역은 최대 5,000행까지 지원해요.',
    EMPTY_BANK_FILE: '가져올 양수 입금 거래가 없어요.',
    INVALID_RESPONSE: '서버의 입금 응답을 확인할 수 없어요.',
    NETWORK_ERROR: '서버에 연결하지 못했어요. 입력을 유지하고 다시 시도해주세요.'
  };
  return messages[error.code] ?? '입금 정보를 처리하지 못했어요. 다시 확인해주세요.';
}
