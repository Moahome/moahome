import {
  expect,
  test
} from '@playwright/test';
import {
  formatInteger,
  formatWon
} from '../src/shared/lib/format';

test('공통 정수·원 표시가 0·음수와 Number 정밀도 밖의 문자열·BigInt를 보존', () => {
  expect(formatInteger(0)).toBe('0');
  expect(formatInteger('1234')).toBe('1,234');
  expect(formatWon('-15000')).toBe('-15,000원');
  expect(formatInteger('9007199254740993')).toBe('9,007,199,254,740,993');
  expect(formatWon(BigInt('-9007199254740993'))).toBe('-9,007,199,254,740,993원');
  expect(formatInteger(Number.MAX_SAFE_INTEGER)).toBe('9,007,199,254,740,991');
});

test('공통 표시가 불완전 입력·소수·지수·구분자가 있는 원본과 안전하지 않은 number를 거부', () => {
  for (const value of ['', '-', '1.5', '1e3', '1,000', '12a', '１２３']) {
    expect(() => formatInteger(value)).toThrow(TypeError);
  }
  for (const value of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => formatWon(value)).toThrow(RangeError);
  }
});
