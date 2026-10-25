import {
  expect,
  test
} from '@playwright/test';
import { calculateEqualSplit } from '../src/shared/lib/equal-split';

// 계산기는 실제 청구와 무관하며 정수 원 단위 결과와 총액 차이를 정확히 안내합니다.
test('참고용 계산은 균등 분담과 원 단위 내림·올림의 총액 차이를 계산', () => {
  expect(calculateEqualSplit('1500000', '20')).toEqual({
    total: BigInt(1500000),
    units: BigInt(20),
    exact: true,
    lower: BigInt(75000),
    upper: BigInt(75000),
    lowerTotal: BigInt(1500000),
    upperTotal: BigInt(1500000),
    shortage: BigInt(0),
    excess: BigInt(0)
  });
  expect(calculateEqualSplit('1500000', '17')).toEqual({
    total: BigInt(1500000),
    units: BigInt(17),
    exact: false,
    lower: BigInt(88235),
    upper: BigInt(88236),
    lowerTotal: BigInt(1499995),
    upperTotal: BigInt(1500012),
    shortage: BigInt(5),
    excess: BigInt(12)
  });
  expect(calculateEqualSplit('0', '20')?.lower).toBe(BigInt(0));
  const large = calculateEqualSplit('999999999999999', '999999999');
  expect(large?.lower).toBe(BigInt(1000000));
  expect(large?.shortage).toBe(BigInt(999999));
});

test('참고용 계산은 빈 입력·0세대·음수·소수·허용 길이 초과를 거부', () => {
  for (const [amount, count] of [
    ['', '20'], ['1500000', ''], ['1500000', '0'], ['1500000', '000'],
    ['-1', '20'], ['1.5', '20'], ['1500000', '-2'], ['1500000', '1.5'],
    ['1000000000000000', '20'], ['1500000', '1000000000']
  ]) expect(calculateEqualSplit(amount, count)).toBeNull();
});
