import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export type BalanceBuilding = { id: string; label: string; active: boolean; startBalance: string | null; income: string; expense: string; balance: string | null; status: 'READY' | 'OPENING_REQUIRED'; openingBalance?: string | null; openingRevision?: number };
export type BalanceEntry = { id: string; buildingId: string; date: string; time: string | null; label: string; income: string; expense: string; paymentId?: string | null };
export type ExternalExpense = { id: string; label: string; expenseName: string; date: string; amount: string; received: string; remaining: string; excluded?: boolean; decisionRevision?: number; recoveries: { id: string; paymentId: string; date: string; payer: string; amount: string }[] };
export type BalanceIncome = { id: string; transactionId: string; date: string; payer: string; amount: string; available: string; kind: 'HOUSEHOLD' | 'OTHER'; linkedBuildingId?: string | null; linkedUnitLabel?: string | null };
export type BalanceWorkspace = {
  propertyId: string; month: string; cutoffDate: string | null; bankBalance: string | null; bankAsOf: string | null;
  buildings: BalanceBuilding[]; entries: BalanceEntry[]; externals: ExternalExpense[]; incomes: BalanceIncome[];
  pending: { id: string; date: string; label: string; direction: string; amount: string }[];
};
const INTEGER = /^-?[0-9]+$/;
const validAmount = (value: unknown): value is string => typeof value === 'string' && INTEGER.test(value);
const validNonnegative = (value: unknown): value is string => validAmount(value) && BigInt(value) >= BigInt(0);

/** 다른 관리대상의 응답과 잘못된 금액을 표시하지 않고 서버에서 확정한 보유금 결과만 사용합니다. */
export async function getBankingBalances(propertyId: string, month: string): Promise<BalanceWorkspace> {
  const data = await authenticatedAPI<BalanceWorkspace>({
    url: `/api/properties/${propertyId}/banking/balances`,
    data: {
      month
    }
  });
  if (data?.propertyId !== propertyId || data.month !== month || !Array.isArray(data.buildings) || !Array.isArray(data.entries)
    || !Array.isArray(data.externals) || !Array.isArray(data.incomes) || !Array.isArray(data.pending)
    || (data.bankBalance !== null && !validAmount(data.bankBalance))
    || data.buildings.some((b) => (b.openingRevision !== undefined && (!Number.isSafeInteger(b.openingRevision) || b.openingRevision < 0)) || (b.openingBalance != null && !validAmount(b.openingBalance)) || ![b.income, b.expense].every(validNonnegative) || (b.balance !== null && !validAmount(b.balance)) || (b.startBalance !== null && !validAmount(b.startBalance)) || !['READY', 'OPENING_REQUIRED'].includes(b.status))
    || data.entries.some((e) => ![e.income, e.expense].every(validNonnegative))
    || data.externals.some((e) => (e.excluded !== undefined && typeof e.excluded !== 'boolean') || (e.decisionRevision !== undefined && (!Number.isSafeInteger(e.decisionRevision) || e.decisionRevision < 0)) || ![e.amount, e.received, e.remaining].every(validNonnegative) || BigInt(e.received) + BigInt(e.remaining) !== BigInt(e.amount) || !Array.isArray(e.recoveries) || e.recoveries.some((r) => !validNonnegative(r.amount)))
    || data.incomes.some((i) => ![i.amount, i.available].every(validNonnegative) || !['HOUSEHOLD', 'OTHER'].includes(i.kind))
    || data.pending.some((p) => !validNonnegative(p.amount))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '동별 잔고 응답을 확인할 수 없습니다.');
  }
  return data;
}

export async function saveCashOpenings(propertyId: string, data: { cutoffDate: string; buildings: { buildingId: string; amount: string }[] }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/openings`,
    method: 'POST',
    data
  });
}
/** 등록된 동 전체의 기준일·마감 잔고를 원자적으로 정정하고 이전 값은 서버 이력에 보존합니다. */
export async function correctCashOpenings(propertyId: string, data: { id: string; cutoffDate: string; buildings: { buildingId: string; amount: string; revision: number }[] }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/openings/corrections`,
    method: 'POST',
    data
  });
}
export async function assignCashIncome(propertyId: string, data: { paymentId: string; buildingId: string }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/income-assignments`,
    method: 'POST',
    data
  });
}
export async function settleExternalExpense(propertyId: string, data: { id: string; allocationId: string; paymentId: string; amount: string }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/settlements`,
    method: 'POST',
    data
  });
}
/** 정산 대상 여부만 바꾸며 거래·입금·배분 금액을 삭제하지 않습니다. */
export async function decideExternalSettlement(propertyId: string, data: { id: string; allocationId: string; excluded: boolean; revision: number }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/settlement-decisions`,
    method: 'POST',
    data
  });
}
export function balanceError(error: unknown): string {
  if (!(error instanceof ApiError)) return '처리하지 못했어요. 입력을 유지하고 다시 시도해주세요.';
  const messages: Record<string, string> = {
    ACCESS_DENIED: '동별 잔고는 관리소장만 확인할 수 있어요.',
    INVALID_CASH_OPENING: '현재 관리 동 전체의 시작 잔고를 원 단위로 입력해주세요.',
    INVALID_CASH_OPENING_DATE: '기준일은 오늘 또는 이전 날짜를 선택해주세요.',
    CASH_OPENING_CONFLICT: '기준 잔고가 변경됐어요. 최신 내역을 다시 열어 확인해주세요.',
    CASH_ASSIGNMENT_CONFLICT: '이미 확정한 동과 달라요. 최신 내역을 확인해주세요.',
    EXTERNAL_SETTLEMENT_EXCLUDED: '정산에서 제외한 내역입니다. 정산 대상으로 복원한 뒤 연결해주세요.',
    EXTERNAL_SETTLEMENT_DECISION_CONFLICT: '정산 대상 상태가 변경됐어요. 최신 내역을 다시 열어주세요.',
    INVALID_EXTERNAL_SETTLEMENT: '외부 부담금과 확정된 기타 입금 거래를 확인해주세요.',
    EXTERNAL_SETTLEMENT_EXCEEDED: '연결 금액이 입금 잔여액 또는 외부 부담 잔여액보다 큽니다.',
    EXTERNAL_SETTLEMENT_CONFLICT: '이 요청은 다른 내용으로 처리됐어요. 최신 내역을 확인해주세요.'
  };
  return messages[error.code] ?? '처리하지 못했어요. 입력을 유지하고 다시 시도해주세요.';
}
