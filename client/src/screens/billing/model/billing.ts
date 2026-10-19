import { FEE_ITEM_OPTIONS } from '@/entities/billing';
import { getTextLength } from '@/shared/lib/format';

import type {
  BillingCharge,
  BillingItem
} from '@/entities/billing';

export const BILLING_TABS = [
  {
    id: 'monthly',
    label: '월별 부과'
  },
  {
    id: 'items',
    label: '관리비 설정'
  },
  {
    id: 'history',
    label: '부과 이력'
  },
  {
    id: 'opening',
    label: '기존 잔액 인계'
  }
] as const;

const MAX_AMOUNT = BigInt('999999999999999');
const UNIT_COLLATOR = new Intl.Collator('ko', {
  numeric: true
});

/** API 반환 순서와 무관하게 동명·호수의 숫자 오름차순으로 정렬하고 원본 청구와 금액은 보존합니다. */
export function getSortedBillingCharges(charges: readonly BillingCharge[]): BillingCharge[] {
  return [...charges].sort((left, right) => UNIT_COLLATOR.compare(left.building, right.building)
    || UNIT_COLLATOR.compare(left.room, right.room));
}

/** 브라우저의 월 입력과 URL을 검증해 빈 값·잘못된 달을 날짜 계산에 사용하지 않습니다. */
export function isBillingMonth(value: string): boolean {
  return /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value);
}

/** 월 단위로 이동하므로 연말·연초에도 다음 달 적용월을 정확하게 구합니다. */
export function shiftBillingMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + offset;

  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

/** 실제 월말을 계산해 2월·윤년·30일인 달에도 납부기한을 31일로 고정하지 않습니다. */
export function getBillingDates(month: string) {
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();

  return {
    billingDate: `${month}-01`,
    dueDate: `${month}-${lastDay}`
  };
}

/** 항목은 원 단위 문자열로 보존하고 0원·음수와 큰 정수를 손실 없이 합산합니다. */
export function sumBillingItems(items: readonly BillingItem[]): bigint {
  return items.reduce((total, item) => total + BigInt(item.amount), BigInt(0));
}

/** 필수 사유·추천 종류·항목·부호 있는 정수와 최종 합계를 검사하며 상쇄 항목을 허용합니다. */
export function getSettingsError(items: BillingItem[], reason: string): string | null {
  if (!reason.trim()) return '수정 사유를 입력해주세요.';
  if (!items.length) return '관리비 항목을 하나 이상 추가해주세요.';
  for (const item of items) {
    if (item.code !== null && !FEE_ITEM_OPTIONS.some((option) => option.value === item.code)) return '항목 종류를 확인해주세요.';
    if (!getTextLength(item.name) || getTextLength(item.name) > 100) return '항목명은 1~100자로 입력해주세요.';
    if (!/^-?[0-9]+$/.test(item.amount)) return '금액을 정수 원 단위로 입력해주세요.';
    const amount = BigInt(item.amount);
    if (amount < -MAX_AMOUNT || amount > MAX_AMOUNT) return '항목 금액이 허용 범위를 초과했어요.';
  }
  const total = sumBillingItems(items);
  if (total < -MAX_AMOUNT || total > MAX_AMOUNT) return '세대당 기본 합계가 허용 범위를 초과했어요.';

  return null;
}
