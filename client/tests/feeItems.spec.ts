import {
  expect,
  test
} from '@playwright/test';
import {
  getFeeItemErrors,
  isFeeItemDraftList,
  getFeeItemsError,
  getFeeItemsTotal,
  MAX_FEE_AMOUNT,
  type FeeItemDraft
} from '../src/features/property-registration/model/feeItems';

/** 실제 화면과 같은 항목 배열로 금액 계산의 경계와 상쇄를 검증합니다. */
function feeItems(amounts: string[]): FeeItemDraft[] {
  return amounts.map((defaultAmount, index) => ({
    clientId: String(index),
    itemCode: null,
    itemName: `항목 ${index}`,
    defaultAmount
  }));
}

test('관리비는 0원·음수·양쪽 경계를 허용하고 소수·지수·미완성 부호와 범위 초과를 거부', () => {
  for (const amount of ['0', '-1', String(MAX_FEE_AMOUNT), String(-MAX_FEE_AMOUNT)]) {
    expect(getFeeItemErrors(feeItems([amount])[0])).toEqual({});
  }
  for (const amount of ['', '-', '1.5', '1e3', '12a', String(MAX_FEE_AMOUNT + BigInt(1)), String(-MAX_FEE_AMOUNT - BigInt(1))]) {
    expect(getFeeItemErrors(feeItems([amount])[0]).defaultAmount).toBeTruthy();
  }
  expect(getFeeItemsError([])).toBeTruthy();
  expect(getFeeItemsError(feeItems(['0']))).toBeNull();
});

test('추천 코드와 직접 입력을 허용하고 초안의 잘못된 코드·중복 ID를 거부', () => {
  const item = feeItems(['0'])[0];
  expect(isFeeItemDraftList([item])).toBe(true);
  expect(isFeeItemDraftList([{
    ...item,
    itemCode: 'CLEANING',
    itemName: '별도 표시 이름'
  }])).toBe(true);
  for (const itemCode of ['UNKNOWN', 'cleaning', '', 0, false, {}, []]) {
    expect(isFeeItemDraftList([{
      ...item,
      itemCode
    }])).toBe(false);
  }
  expect(isFeeItemDraftList([item, item])).toBe(false);
});

test('합계는 입력 순서와 중간 초과에 영향을 받지 않고 양수·음수 최종 범위를 정확히 검증', () => {
  const max = String(MAX_FEE_AMOUNT);
  const min = String(-MAX_FEE_AMOUNT);
  for (const amounts of [[max, max, min], [min, max, max], [min, min, max]]) {
    const items = feeItems(amounts);
    expect(getFeeItemsError(items)).toBeNull();
    expect(getFeeItemsTotal(items)).toBe(amounts[0] === min && amounts[1] === min ? -MAX_FEE_AMOUNT : MAX_FEE_AMOUNT);
  }
  // 중간 합계가 Number의 안전한 정수 범위를 넘어도 1원 차이를 잃지 않습니다.
  const items = feeItems([...Array(20).fill(max), '1', ...Array(20).fill(min)]);
  expect(getFeeItemsTotal(items)).toBe(BigInt(1));
  expect(getFeeItemsError(feeItems([max, '1']))).toContain('합계');
  expect(getFeeItemsError(feeItems([min, '-1']))).toContain('합계');
});
