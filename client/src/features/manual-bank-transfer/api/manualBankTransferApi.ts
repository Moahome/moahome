import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  ManualBankTransferInput,
  ManualTransferFunds,
  ManualBankTransferResult
} from './manualBankTransferApiTypes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const amount = (value: unknown) => value === null || (typeof value === 'string' && /^[0-9]+$/.test(value));

/** 계좌·날짜가 다른 응답이나 미확인 보유금을 정상 한도로 사용하지 않습니다. */
export async function getManualTransferFunds(propertyId: string, accountId: string, date: string, signal?: AbortSignal) {
  const data = await authenticatedAPI<ManualTransferFunds>({
    url: `/api/properties/${propertyId}/banking/balances/transfer-funds`,
    data: {
      accountId,
      date
    },
    signal
  });
  if (data?.propertyId !== propertyId || data.accountId !== accountId || data.date !== date || !amount(data.accountAvailable)
    || !Array.isArray(data.buildings) || data.buildings.some((value) => !UUID.test(value.buildingId) || !amount(value.available))
    || new Set(data.buildings.map((value) => value.buildingId)).size !== data.buildings.length) {
    throw new ApiError(200, 'INVALID_RESPONSE', '이체 가능 금액을 확인할 수 없습니다.');
  }
  return data;
}

/** 은행 원본·수납·지출을 만들지 않고 동일 요청 ID로 이체를 한 번 등록합니다. 성공 후 기존 조회를 갱신합니다. */
export async function createManualBankTransfer(propertyId: string, data: ManualBankTransferInput) {
  const result = await authenticatedAPI<ManualBankTransferResult>({
    url: `/api/properties/${propertyId}/banking/transfers/manual`,
    method: 'POST',
    data
  });
  if (result?.propertyId !== propertyId) throw new ApiError(200, 'INVALID_RESPONSE', '이체 결과를 확인할 수 없습니다.');
}

export function manualTransferError(error: unknown): string {
  if (!(error instanceof ApiError)) return '이체를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  const messages: Record<string, string> = {
    BANK_TRANSFER_BALANCE_REQUIRED: '출금 통장과 동별 기준 잔고를 먼저 확인해주세요.',
    BANK_TRANSFER_BALANCE_EXCEEDED: '이체금액이 출금 통장의 보유금을 초과합니다. 최신 금액을 확인해주세요.',
    BANK_TRANSFER_EXISTING_TRANSACTION: '이미 가져온 같은 은행 거래가 있습니다. 통장 거래에서 해당 내역을 이체로 설정해주세요.',
    BANK_REQUEST_CONFLICT: '같은 요청으로 이미 다른 내용이 저장되었습니다. 최신 거래를 확인해주세요.',
    INVALID_TRANSFER_ACCOUNT: '서로 다른 사용 중인 관리 통장을 선택해주세요.',
    BANK_TRANSFER_ACCOUNT_CONFLICT: '계좌 이체 설정을 확인해주세요.'
  };
  return messages[error.code ?? ''] ?? '이체를 저장하지 못했어요. 입력 내용을 확인한 뒤 다시 시도해주세요.';
}
