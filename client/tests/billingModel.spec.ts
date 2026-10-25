import type {
  BillingCharge,
  BillingItem,
  BillingPlan
} from '../src/entities/billing';
import {
  expect,
  test
} from '@playwright/test';
import {
  getBillingDates,
  getBillingPlan,
  getBillingPlanError,
  getPlanItems,
  getSettingsError,
  getSortedBillingCharges,
  isBillingMonth,
  shiftBillingMonth,
  sumBillingItems
} from '../src/screens/billing/model/billing';

function items(amounts: string[]): BillingItem[] {
  return amounts.map((amount, index) => ({
    id: String(index),
    code: null,
    name: `항목 ${index}`,
    amount
  }));
}

test('뒤섞인 청구는 동·호수 숫자 오름차순으로 표시하고 동 없음은 호수순으로 표시', () => {
  const input = [
    ['103동', '301'], ['102동', '502'], ['103동', '402'], ['103동', '302'],
    ['103동', '602'], ['102동', '301'], ['103동', '502'], ['2동', '10'], ['2동', '2'], ['10동', '1']
  ];
  const charges: BillingCharge[] = input.map(([building, room], index) => ({
    id: String(index),
    unitId: String(index),
    building,
    room,
    displayName: null,
    representativeName: null,
    items: items(['10000'])
  }));
  expect(getSortedBillingCharges(charges).map((charge) => [charge.building, charge.room])).toEqual([
    ['2동', '2'], ['2동', '10'], ['10동', '1'], ['102동', '301'], ['102동', '502'],
    ['103동', '301'], ['103동', '302'], ['103동', '402'], ['103동', '502'], ['103동', '602']
  ]);
  expect(charges.map((charge) => [charge.building, charge.room])).toEqual(input);
  const noBuildings = charges.map((charge) => ({
    ...charge,
    building: ''
  }));
  expect(getSortedBillingCharges(noBuildings).map((charge) => charge.room)).toEqual([
    '1', '2', '10', '301', '301', '302', '402', '502', '502', '602'
  ]);
});

test('관리비 일정은 연말 다음 달과 실제 월말·윤년을 계산하고 잘못된 월을 거부', () => {
  expect(shiftBillingMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftBillingMonth('2026-01', -1)).toBe('2025-12');
  for (const [month, last] of [['2026-10', '31'], ['2026-11', '30'], ['2026-02', '28'], ['2028-02', '29']]) {
    expect(getBillingDates(month)).toEqual({
      billingDate: `${month}-01`,
      dueDate: `${month}-${last}`
    });
  }
  for (const month of ['', '2026-00', '2026-13', '2026-1', 'invalid']) expect(isBillingMonth(month)).toBe(false);
  expect(isBillingMonth('2026-10')).toBe(true);
});

test('다음 달 설정은 사유가 필수이고 0원·음수·상쇄를 허용하며 잘못된 금액과 최종 범위를 거부', () => {
  expect(getSettingsError(items(['0']), '')).toBe('수정 사유를 입력해주세요.');
  expect(getSettingsError(items(['0']), '   ')).toBe('수정 사유를 입력해주세요.');
  for (const amount of ['0', '-1', '999999999999999', '-999999999999999']) {
    expect(getSettingsError(items([amount]), '기본 금액 조정')).toBeNull();
  }
  for (const amount of ['', '-', '1.5', '1e3', '1000000000000000', '-1000000000000000']) {
    expect(getSettingsError(items([amount]), '조정')).toBeTruthy();
  }
  expect(getSettingsError([], '조정')).toBeTruthy();
  expect(getSettingsError(items(['999999999999999', '1']), '조정')).toContain('합계');
  const balanced = items(['999999999999999', '999999999999999', '-999999999999999']);
  expect(getSettingsError(balanced, '조정')).toBeNull();
  expect(sumBillingItems(balanced)).toBe(BigInt('999999999999999'));
});


test('전체 기본과 동별 임시는 독립 적용하고 종료된 임시 항목을 다음 달 편집에 복사하지 않음', () => {
  const plan: BillingPlan = {
    mode: 'ALL',
    items: items(['50000']),
    buildingItems: [],
    temporaryMode: 'BUILDING',
    temporaryItems: [{
      ...items(['100000'])[0],
      buildingId: '102',
      note: ''
    }]
  };
  expect(sumBillingItems(getPlanItems(plan, '101'))).toBe(BigInt(50000));
  expect(sumBillingItems(getPlanItems(plan, '102'))).toBe(BigInt(150000));
  expect(getBillingPlanError(plan, '수선비', ['101', '102'])).toBeNull();
  expect(getBillingPlanError({
    ...plan,
    temporaryItems: [{
      ...plan.temporaryItems[0],
      buildingId: null
    }]
  }, '수선비', ['101', '102'])).toContain('대상 동');
  const next = getBillingPlan({
    ...plan,
    id: 'template',
    effectiveMonth: '2026-11',
    reason: null,
    changedAt: ''
  }, false);
  expect(next.mode).toBe('ALL');
  expect(next.temporaryItems).toEqual([]);
  expect(sumBillingItems(getPlanItems(next, '102'))).toBe(BigInt(50000));
});

test('동별 합계는 동마다 검사하고 기본과 임시를 더한 범위를 검증', () => {
  const plan: BillingPlan = {
    mode: 'BUILDING',
    items: [],
    temporaryMode: 'ALL',
    temporaryItems: [],
    buildingItems: ['101', '102'].map((buildingId) => ({
      buildingId,
      items: items(['999999999999999'])
    }))
  };
  expect(getBillingPlanError(plan, '동별 금액', ['101', '102'])).toBeNull();
  expect(getBillingPlanError({
    ...plan,
    temporaryItems: [{
      ...items(['1'])[0],
      buildingId: null,
      note: ''
    }]
  }, '추가', ['101', '102'])).toContain('합한');
  expect(getBillingPlanError({
    ...plan,
    buildingItems: plan.buildingItems.slice(0, 1)
  }, '누락', ['101', '102'])).toContain('각 동');
});
