import {
  expect,
  test
} from '@playwright/test';
import { evaluateExpression } from '../src/shared/lib/calculator';

test('일반 계산은 우선순위·괄호·음수·소수와 큰 정수를 정확하게 계산', () => {
  for (const [expression, value] of [
    ['2 + 3 * 4', '14'], ['(2 + 3) × 4', '20'], ['-2 * -(3 + 1)', '8'],
    ['0.1 + 0.2', '0.3'], ['9007199254740993 + 1', '9007199254740994'],
    ['1 ÷ 3 × 3', '1'], ['1/8', '0.125'], ['.5 + .25', '0.75'], ['0/10', '0'], ['-0', '0']
  ]) expect(evaluateExpression(expression)).toEqual({
    ok: true,
    value,
    approximate: false
  });
});

test('나누어떨어지지 않는 일반 계산은 마지막 표시에서만 소수점 12자리 반올림', () => {
  expect(evaluateExpression('1500000 ÷ 17')).toEqual({
    ok: true,
    value: '88235.294117647059',
    approximate: true
  });
  expect(evaluateExpression('-1/6')).toEqual({
    ok: true,
    value: '-0.166666666667',
    approximate: true
  });
});

test('잘못된 계산식·0으로 나눔·과도한 입력을 계산 결과로 대체하지 않음', () => {
  for (const expression of ['', '1 +', '()', '(2+3', '2**3', '1 2', '1,5', 'alert(1)', '2(3)', '1/(2-2)',
    '9'.repeat(31), '('.repeat(33)+'1'+')'.repeat(33), '1+'.repeat(129)+'1']) {
    expect(evaluateExpression(expression).ok).toBe(false);
  }
  expect(evaluateExpression('1/0')).toEqual({
    ok: false,
    error: '0으로 나눌 수 없습니다.'
  });
});
