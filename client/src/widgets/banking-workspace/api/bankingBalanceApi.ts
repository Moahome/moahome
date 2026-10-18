import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export type BalanceBuilding = { id: string; label: string; active: boolean; startBalance: string | null; income: string; expense: string; balance: string | null; status: 'READY' | 'OPENING_REQUIRED'; openingBalance?: string | null; openingRevision?: number };
export type BalanceEntry = { id: string; buildingId: string; date: string; time: string | null; label: string; income: string; expense: string; paymentId?: string | null; accountId?: string | null };
export type ExternalExpense = { accountId?: string; transactionId?: string; transactionAmount?: string; id: string; label: string; expenseName: string; date: string; amount: string; received: string; remaining: string; excluded?: boolean; decisionRevision?: number; recoveries: { id: string; paymentId: string; date: string; payer: string; amount: string }[] };
export type BalanceIncome = { accountId?: string; id: string; transactionId: string | null; date: string; payer: string; amount: string; available: string; kind: 'HOUSEHOLD' | 'OTHER'; linkedBuildingId?: string | null; linkedUnitLabel?: string | null };
export type AccountBalance = { id: string; label: string; status: string; balance: string | null; asOf: string | null; openingDate?: string | null; openingBalance?: string | null; openingRevision?: number; calculatedBalance?: string | null; calculationBasisDate?: string | null };
export type BalanceWorkspace = {
  accounts?: AccountBalance[];
  legacyOpening?: { cutoffDate: string; buildings: { buildingId: string; amount: string }[] } | null;
  accountId?: string | null; propertyId: string; month: string; cutoffDate: string | null; bankBalance: string | null; bankAsOf: string | null;
  buildings: BalanceBuilding[]; entries: BalanceEntry[]; externals: ExternalExpense[]; incomes: BalanceIncome[];
  pending: { id: string; date: string; label: string; direction: string; amount: string }[];
};
const INTEGER = /^-?[0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validAmount = (value: unknown): value is string => typeof value === 'string' && INTEGER.test(value);
const validNonnegative = (value: unknown): value is string => validAmount(value) && BigInt(value) >= BigInt(0);

/** 다른 관리대상의 응답과 잘못된 금액을 표시하지 않고 서버에서 확정한 보유금 결과만 사용합니다. */
export async function getBankingBalances(propertyId: string, month: string, accountId?: string): Promise<BalanceWorkspace> {
  const data = await authenticatedAPI<BalanceWorkspace>({
    url: `/api/properties/${propertyId}/banking/balances`,
    data: {
      month,
      ...(accountId ? {
        accountId
      } : {})
    }
  });
  // 사용 전 월로 이동하면 서버가 해당 월의 전체 통장 범위로 돌려줍니다. 목록에 남은 통장의 선택 불일치는 허용하지 않습니다.
  const resetToAll = accountId !== undefined && data?.accountId === null && Array.isArray(data.accounts) && !data.accounts.some((account) => account.id === accountId);
  if (data?.propertyId !== propertyId || data.month !== month || (data.accountId !== undefined && data.accountId !== (accountId ?? null) && !resetToAll) || !Array.isArray(data.buildings) || !Array.isArray(data.entries)
    || (data.legacyOpening != null && (!/^\d{4}-\d{2}-\d{2}$/.test(data.legacyOpening.cutoffDate) || !Array.isArray(data.legacyOpening.buildings) || data.legacyOpening.buildings.some((part) => typeof part.buildingId !== 'string' || !validAmount(part.amount))))
    || !Array.isArray(data.externals) || !Array.isArray(data.incomes) || !Array.isArray(data.pending)
    || (data.bankBalance !== null && !validAmount(data.bankBalance))
    || (data.accounts !== undefined && (!Array.isArray(data.accounts) || data.accounts.some((a) => typeof a.id !== 'string' || typeof a.label !== 'string' || (a.calculatedBalance != null && (!validAmount(a.calculatedBalance) || !/^\d{4}-\d{2}-\d{2}$/.test(a.calculationBasisDate ?? ''))) || (a.calculationBasisDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(a.calculationBasisDate)) || (a.openingDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(a.openingDate)) || (a.openingBalance != null && !validNonnegative(a.openingBalance)) || (a.openingRevision !== undefined && (!Number.isSafeInteger(a.openingRevision) || a.openingRevision < 0)) || (a.balance !== null && !validAmount(a.balance)))))
    || data.buildings.some((b) => (b.openingRevision !== undefined && (!Number.isSafeInteger(b.openingRevision) || b.openingRevision < 0)) || (b.openingBalance != null && !validAmount(b.openingBalance)) || ![b.income, b.expense].every(validNonnegative) || (b.balance !== null && !validAmount(b.balance)) || (b.startBalance !== null && !validAmount(b.startBalance)) || !['READY', 'OPENING_REQUIRED'].includes(b.status))
    || data.entries.some((e) => ![e.income, e.expense].every(validNonnegative))
    || data.externals.some((e) => (e.excluded !== undefined && typeof e.excluded !== 'boolean') || (e.decisionRevision !== undefined && (!Number.isSafeInteger(e.decisionRevision) || e.decisionRevision < 0)) || ![e.amount, e.received, e.remaining].every(validNonnegative) || BigInt(e.received) + BigInt(e.remaining) !== BigInt(e.amount) || ((e.transactionId !== undefined || e.transactionAmount !== undefined) && (typeof e.transactionId !== 'string' || !UUID.test(e.transactionId) || !validNonnegative(e.transactionAmount) || BigInt(e.transactionAmount) < BigInt(e.amount))) || !Array.isArray(e.recoveries) || e.recoveries.some((r) => !validNonnegative(r.amount)))
    || data.incomes.some((i) => ![i.amount, i.available].every(validNonnegative) || !['HOUSEHOLD', 'OTHER'].includes(i.kind))
    || data.pending.some((p) => !validNonnegative(p.amount))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '동별 잔고 응답을 확인할 수 없습니다.');
  }
  return data;
}

export async function saveCashOpenings(propertyId: string, data: { accountId?: string; cutoffDate: string; buildings: { buildingId: string; amount: string }[] }) {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/banking/balances/openings`,
    method: 'POST',
    data
  });
}
/** 등록된 동 전체의 기준일·마감 잔고를 원자적으로 정정하고 이전 값은 서버 이력에 보존합니다. */
export async function correctCashOpenings(propertyId: string, data: { id: string; accountId?: string; cutoffDate: string; buildings: { buildingId: string; amount: string; revision: number }[] }) {
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
    INVALID_BANK_OPENING: '통장의 기초 잔액을 0원 이상의 원 단위로 입력해주세요.',
    INVALID_BANK_OPENING_DATE: '통장별 기준일은 오늘 또는 이전 날짜로 선택해주세요.',
    BANK_OPENING_CONFLICT: '통장 기초 잔액이 변경됐어요. 창을 다시 열어 최신 값을 확인해주세요.',
    PAYMENT_ACCOUNT_UNAVAILABLE: '사용 중인 통장을 선택해주세요.',
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
