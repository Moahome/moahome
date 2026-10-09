import {
  FEE_ITEM_OPTIONS,
  type FeeItemCode
} from '@/entities/billing';
import { getTextLength } from './basicInfo';

export const MAX_FEE_AMOUNT = BigInt('999999999999999');

export interface FeeItemDraft {
  clientId: string;
  itemCode: FeeItemCode | null;
  itemName: string;
  defaultAmount: string;
}

export type FeeItemErrors = Partial<Record<'itemCode' | 'itemName' | 'defaultAmount', string>>;

/** 추천 코드·이름과 원 단위 정수를 검증하며 직접 입력의 null 코드와 0원·음수를 허용합니다. */
export function getFeeItemErrors(item: Pick<FeeItemDraft, 'itemCode' | 'itemName' | 'defaultAmount'>): FeeItemErrors {
  const errors: FeeItemErrors = {};
  if (item.itemCode !== null && !FEE_ITEM_OPTIONS.some((option) => option.value === item.itemCode)) {
    errors.itemCode = '관리비 항목 종류를 확인해주세요.';
  }
  const nameLength = getTextLength(item.itemName);
  if (!nameLength) errors.itemName = '항목명을 입력해주세요.';
  if (nameLength > 100) errors.itemName = '항목명은 100자 이내로 입력해주세요.';
  if (!/^-?[0-9]+$/.test(item.defaultAmount)) {
    errors.defaultAmount = '금액을 정수 원 단위로 입력해주세요.';
    return errors;
  }

  const amount = BigInt(item.defaultAmount);
  if (amount < -MAX_FEE_AMOUNT || amount > MAX_FEE_AMOUNT) {
    errors.defaultAmount = '금액은 -999,999,999,999,999원부터 999,999,999,999,999원까지 입력할 수 있어요.';
  }
  return errors;
}

/** 합산 중 범위를 넘더라도 상쇄 항목을 모두 반영한 최종 합계를 정확하게 계산합니다. */
export function getFeeItemsTotal(items: FeeItemDraft[]) {
  return items.reduce((total, item) => total + BigInt(item.defaultAmount), BigInt(0));
}

/** 최소 항목 수와 개별 입력을 확인한 뒤 최종 합계의 양·음수 저장 범위를 검증합니다. */
export function getFeeItemsError(items: FeeItemDraft[]) {
  if (!items.length) return '관리비 항목을 하나 이상 추가해주세요.';
  if (items.some((item) => Object.keys(getFeeItemErrors(item)).length)) return '관리비 항목명과 금액을 확인해주세요.';

  const total = getFeeItemsTotal(items);
  if (total < -MAX_FEE_AMOUNT || total > MAX_FEE_AMOUNT) return '관리비 합계가 허용 범위를 초과했어요. 항목 금액을 수정해주세요.';
  return null;
}

/** 손상된 목록은 해당 단계만 비워 복원하고 앞 단계의 입력은 그대로 유지합니다. */
export function isFeeItemDraftList(value: unknown): value is FeeItemDraft[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item.clientId !== 'string' || !item.clientId || ids.has(item.clientId)
      || typeof item.itemName !== 'string' || typeof item.defaultAmount !== 'string'
      || Object.keys(getFeeItemErrors(item)).length) return false;
    ids.add(item.clientId);
    return true;
  });
}
