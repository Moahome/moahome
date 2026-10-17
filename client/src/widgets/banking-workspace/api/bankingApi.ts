import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export type BankingAllocation = { buildingId: string | null; label: string; amount: string; percentage: string | null };
export type ExpenseDraft = {
  category: string; note: string; mode: 'EQUAL' | 'RATIO' | 'AMOUNT'; saveAsRule: boolean; allocations: BankingAllocation[];
};
export type BankingExpense = ExpenseDraft & { id: string };
export type BankingTransaction = {
  id: string; accountId: string; date: string; time: string | null; payer: string; memo: string | null;
  amount: string; balance: string | null; direction: 'INCOME' | 'EXPENSE'; ruleKey: string;
  paymentId: string | null; status: string; unitId: string; unitLabel: string; expense: BankingExpense | null; incomeAllocation?: BankingExpense | null; receiptType?: 'HOUSEHOLD' | 'OTHER' | null;
};
export type BankingWorkspaceData = {
  propertyId: string; asOf: string; buildings: { id: string; label: string }[]; units: { id: string; label: string }[];
  rows: BankingTransaction[];
  rules: { key: string; accountId: string; category: string; mode: ExpenseDraft['mode']; allocations: BankingAllocation[] }[];
};
export type BankingPreview = { propertyId: string; rows: BankingTransaction[]; duplicateCount: number; beforeCutoffCount: number };
export type BankingSelection = { id: string; unitId?: string; incomeCategory?: string; incomeNote?: string; expense?: ExpenseDraft; incomeAllocation?: ExpenseDraft };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT = /^[0-9]{1,15}$/;

/** 서버가 확정한 범위·방향·원 단위 금액을 확인한 뒤 화면에 반영합니다. */
function validRows(rows: BankingTransaction[]): boolean {
  return Array.isArray(rows) && rows.length <= 100_000 && rows.every((row) => row && UUID.test(row.id) && UUID.test(row.accountId)
    && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && typeof row.payer === 'string' && typeof row.amount === 'string'
    && AMOUNT.test(row.amount) && BigInt(row.amount) > BigInt(0) && ['INCOME', 'EXPENSE'].includes(row.direction)
    && (row.balance === null || (typeof row.balance === 'string' && /^-?[0-9]{1,15}$/.test(row.balance)))
    && (row.paymentId === null || UUID.test(row.paymentId)) && typeof row.unitId === 'string'
    && ['PENDING', 'ON_HOLD', 'CONFIRMED', 'CANCELED', 'LINKED'].includes(row.status)
    && (row.receiptType == null || ['HOUSEHOLD', 'OTHER'].includes(row.receiptType))
    && (row.incomeAllocation == null || (row.direction === 'INCOME' && row.receiptType === 'OTHER'
      && UUID.test(row.incomeAllocation.id) && typeof row.incomeAllocation.category === 'string'
      && ['EQUAL', 'RATIO', 'AMOUNT'].includes(row.incomeAllocation.mode) && Array.isArray(row.incomeAllocation.allocations)
      && row.incomeAllocation.allocations.length > 0 && row.incomeAllocation.allocations.every((a) => UUID.test(a.buildingId ?? '') && typeof a.label === 'string' && AMOUNT.test(a.amount) && BigInt(a.amount) > BigInt(0))
      && row.incomeAllocation.allocations.reduce((sum, a) => sum + BigInt(a.amount), BigInt(0)) === BigInt(row.amount)))
    && (row.expense === null || (UUID.test(row.expense.id) && typeof row.expense.category === 'string'
      && ['EQUAL', 'RATIO', 'AMOUNT'].includes(row.expense.mode) && Array.isArray(row.expense.allocations)
      && row.expense.allocations.every((a) => (a.buildingId === null || UUID.test(a.buildingId)) && typeof a.label === 'string' && AMOUNT.test(a.amount)))));
}
function readWorkspace(result: BankingWorkspaceData, propertyId: string): BankingWorkspaceData {
  if (!result || result.propertyId !== propertyId || !validRows(result.rows) || !Array.isArray(result.buildings)
    || !result.buildings.every((b) => UUID.test(b.id) && typeof b.label === 'string') || !Array.isArray(result.units)
    || !result.units.every((u) => UUID.test(u.id) && typeof u.label === 'string') || !Array.isArray(result.rules)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '통장 응답을 확인할 수 없습니다.');
  }
  return result;
}
export async function getBankingWorkspace(propertyId: string) {
  return readWorkspace(await authenticatedAPI<BankingWorkspaceData>({
    url: `/api/properties/${propertyId}/banking/workspace`
  }), propertyId);
}
export async function previewBankingFile(propertyId: string, file: File) {
  const data = new FormData(); data.append('file', file);
  const result = await authenticatedAPI<BankingPreview>({
    url: `/api/properties/${propertyId}/banking/import/preview`,
    method: 'POST',
    data,
    timeoutMs: 60_000
  });
  if (!result || result.propertyId !== propertyId || !validRows(result.rows) || result.rows.length > 5000
    || !Number.isInteger(result.duplicateCount) || result.duplicateCount < 0 || !Number.isInteger(result.beforeCutoffCount) || result.beforeCutoffCount < 0) {
    throw new ApiError(200, 'INVALID_RESPONSE', '미리보기 응답을 확인할 수 없습니다.');
  }
  return result;
}
/** 선택 ID와 분류만 전송하고 원본 일시·금액은 서버가 파일을 다시 읽어 검증합니다. */
export async function importBankingFile(propertyId: string, file: File, rows: BankingSelection[]) {
  const data = new FormData(); data.append('file', file);
  data.append('selection', new Blob([JSON.stringify({
    rows
  })], {
    type: 'application/json'
  }));
  return readWorkspace(await authenticatedAPI<BankingWorkspaceData>({
    url: `/api/properties/${propertyId}/banking/import`,
    method: 'POST',
    data,
    timeoutMs: 60_000
  }), propertyId);
}
export async function confirmBankingExpense(propertyId: string, id: string, data: ExpenseDraft) {
  return readWorkspace(await authenticatedAPI<BankingWorkspaceData>({
    url: `/api/properties/${propertyId}/banking/transactions/${id}/expense`,
    method: 'POST',
    data
  }), propertyId);
}
/** 선택한 통장 원본 전체를 한 번에 삭제하고 서버가 재계산한 목록을 반환합니다. */
export async function deleteBankingTransactions(propertyId: string, transactionIds: string[]) {
  return readWorkspace(await authenticatedAPI<BankingWorkspaceData>({
    url: `/api/properties/${propertyId}/banking/transactions/delete`,
    method: 'POST',
    data: {
      transactionIds
    }
  }), propertyId);
}
/** 기타 입금의 전액 배분을 원본 한 건에 연결하며 같은 요청 재시도는 중복 저장하지 않습니다. */
export async function allocateBankingIncome(propertyId: string, id: string, data: ExpenseDraft) {
  return readWorkspace(await authenticatedAPI<BankingWorkspaceData>({
    url: `/api/properties/${propertyId}/banking/transactions/${id}/income-allocation`,
    method: 'POST',
    data
  }), propertyId);
}
export function bankingError(error: unknown): string {
  if (!(error instanceof ApiError)) return '통장 정보를 처리하지 못했어요. 다시 시도해주세요.';
  const messages: Record<string, string> = {
    OTHER_INCOME_REQUIRED: '이자 등 기타 입금으로 확정한 뒤 동별로 배분해주세요.',
    INCOME_ALREADY_SETTLED: '외부 정산에 연결한 입금은 동별로 중복 배분할 수 없어요.',
    OPENING_BALANCE_REQUIRED: '기존 잔액 인계에서 관리 시작을 먼저 확정해주세요.',
    ACCESS_DENIED: '통장 관리는 관리소장만 사용할 수 있어요.',
    PAYMENT_ACCOUNT_UNAVAILABLE: '등록된 공용 기본 관리계좌를 확인해주세요.',
    INVALID_BANK_FILE: '.xls·.xlsx 또는 UTF-8 CSV 파일을 확인해주세요. 최대 5MB이며 수식은 지원하지 않아요.',
    INVALID_BANK_HEADER: '거래일·입금액·출금액·입금자 또는 내용 열을 확인해주세요.',
    INVALID_BANK_ROW: '거래의 날짜·내용·입출금 금액을 확인해주세요.',
    EMPTY_BANK_FILE: '가져올 입출금 거래가 없어요.',
    BANK_ROW_LIMIT: '거래내역은 최대 5,000행까지 지원해요.',
    INVALID_BANK_SELECTION: '선택과 파일이 일치하지 않아요. 미리보기를 다시 확인해주세요.',
    INVALID_EXPENSE_TARGET: '부담 동이 변경됐어요. 현재 관리대상의 동을 다시 선택해주세요.',
    INVALID_EXPENSE_ALLOCATION: '지출명·부담할 곳·금액을 확인해주세요.',
    EXPENSE_ALLOCATION_MISMATCH: '부담액 합계가 출금액과 일치해야 해요. 비율 합계는 100%로 맞춰주세요.',
    ALLOCATION_REMAINDER_REQUIRED: '원 미만 금액이 남아요. 금액 직접 입력으로 조정해주세요.',
    BANK_REQUEST_CONFLICT: '이미 확정한 지출과 내용이 달라요. 최신 거래를 확인해주세요.',
    PAYMENT_DUPLICATE_REVIEW_REQUIRED: '같은 수동 수납이 있어요. 세대 지정을 해제하고 가져온 뒤 상세에서 기존 수납 연결을 확인해주세요.',
    PAYMENT_UNIT_UNAVAILABLE: '현재 사용 중인 세대를 다시 선택해주세요.',
    NETWORK_ERROR: '서버에 연결하지 못했어요. 선택과 입력을 유지하고 다시 시도해주세요.',
  };
  return messages[error.code] ?? '통장 정보를 처리하지 못했어요. 입력을 확인하고 다시 시도해주세요.';
}
