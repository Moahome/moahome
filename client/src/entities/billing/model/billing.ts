import type {
  BillingCharge,
  BillingItem
} from './billingTypes';

const UNIT_COLLATOR = new Intl.Collator('ko', {
  numeric: true
});

/** API 반환 순서와 무관하게 동명·호수의 숫자 오름차순으로 정렬하고 원본 청구와 금액은 보존합니다. */
export function getSortedBillingCharges(charges: readonly BillingCharge[]): BillingCharge[] {
  return [...charges].sort((left, right) => UNIT_COLLATOR.compare(left.building, right.building)
    || UNIT_COLLATOR.compare(left.room, right.room));
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
