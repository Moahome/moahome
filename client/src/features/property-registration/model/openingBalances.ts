import type {
  OpeningBalancesDraft,
  UnitOpeningDraft
} from './openingBalancesTypes';
import type {
  BuildingDraft,
  UnitDraft
} from './unitSetupTypes';

export const EMPTY_OPENING_BALANCES: OpeningBalancesDraft = {
  cutoffDate: '',
  firstBillingMonth: '',
  unitMode: '',
  units: {},
  accountAmount: '',
  cashCutoffDate: '',
  buildings: {}
};
const AMOUNT = /^[0-9]{1,15}$/;
const CASH_AMOUNT = /^-?[0-9]{1,15}$/;

/** 화면과 복원 검증에서 한국시간의 실제 날짜만 허용하며 미래 기준일은 확정하지 않습니다. */
export function getOpeningToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).format(new Date());
}
function validDate(value: string) {
  return /^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** 미납·선납 없음은 명시적으로 선택한 경우에만 0원으로 변환합니다. */
export function getUnitOpening(opening: OpeningBalancesDraft, id: string): UnitOpeningDraft {
  if (opening.unitMode === 'NONE') return {
    receivable: '0',
    credit: '0'
  };
  return opening.units[id] ?? {
    receivable: '',
    credit: ''
  };
}
/** 기준일과 전체 세대의 명시적인 금액을 확인해 미입력 상태로 다음 단계에 진행하지 못하게 합니다. */
export function getUnitOpeningError(opening: OpeningBalancesDraft, units: UnitDraft[]) {
  if (!validDate(opening.cutoffDate) || opening.cutoffDate > getOpeningToday()) return '기존 장부 기준일을 오늘 또는 이전 날짜로 선택해주세요.';
  if (!opening.unitMode) return '기존 미납·선납이 있는지 선택해주세요.';
  if (units.some((unit) => Object.values(getUnitOpening(opening, unit.clientId)).some((amount) => !AMOUNT.test(amount)))) return '모든 세대의 기존 미납·선납을 입력해주세요. 없는 금액은 0원으로 확인해주세요.';
  return '';
}
/** 실제 계좌 잔액과 전체 동의 보유금을 별도로 검증하며 합계 일치를 강제하지 않습니다. */
export function getCashOpeningError(opening: OpeningBalancesDraft, buildings: BuildingDraft[], accounts?: { openingAmount: string }[]) {
  if (accounts ? !accounts.length || accounts.some((account) => !AMOUNT.test(account.openingAmount)) : !AMOUNT.test(opening.accountAmount)) return '각 통장의 실제 잔액을 원 단위로 입력해주세요.';
  if (!buildings.length) return '';
  if (!validDate(opening.cashCutoffDate) || opening.cashCutoffDate > getOpeningToday()) return '동별 잔고 기준일을 오늘 또는 이전 날짜로 선택해주세요.';
  if (buildings.some((building) => !CASH_AMOUNT.test(opening.buildings[building.clientId] ?? ''))) return '모든 동의 보유금을 입력해주세요. 모르는 금액을 0원으로 확정하지 마세요.';
  return '';
}
/** 장부 기준일 이후의 이번 달 또는 다음 달만 첫 부과월로 지정할 수 있습니다. */
export function getFirstBillingError(opening: OpeningBalancesDraft) {
  const month = getOpeningToday().slice(0, 7);
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const nextMonth = date.toISOString().slice(0, 7);
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(opening.firstBillingMonth)
    || opening.firstBillingMonth < month || opening.firstBillingMonth > nextMonth
    || !validDate(opening.cutoffDate) || `${opening.firstBillingMonth}-01` <= opening.cutoffDate) return '첫 부과월은 장부 기준일 이후의 이번 달 또는 다음 달로 선택해주세요.';
  return '';
}

/** 삭제된 초안 ID는 제외하고 자료형이 깨진 금액은 재입력하게 하며 이전 초안을 자동 확정하지 않습니다. */
export function restoreOpeningBalances(value: unknown, units: UnitDraft[], buildings: BuildingDraft[]): OpeningBalancesDraft {
  const data = value as Partial<OpeningBalancesDraft> | null;
  const result: OpeningBalancesDraft = {
    ...EMPTY_OPENING_BALANCES,
    units: {},
    buildings: {}
  };
  if (!data || typeof data !== 'object') return result;
  for (const key of ['cutoffDate', 'firstBillingMonth', 'accountAmount', 'cashCutoffDate'] as const) {
    if (typeof data[key] === 'string') result[key] = data[key];
  }
  if (data.unitMode === 'NONE' || data.unitMode === 'ENTER') result.unitMode = data.unitMode;
  for (const unit of units) {
    const row = data.units?.[unit.clientId];
    if (row && typeof row.receivable === 'string' && typeof row.credit === 'string') result.units[unit.clientId] = {
      receivable: row.receivable,
      credit: row.credit
    };
  }
  for (const building of buildings) {
    const amount = data.buildings?.[building.clientId];
    if (typeof amount === 'string') result.buildings[building.clientId] = amount;
  }
  return result;
}
