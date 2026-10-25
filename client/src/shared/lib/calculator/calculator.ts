import type {
  CalculatorResult,
  Fraction
} from './calculatorTypes';

/** 매 연산마다 약분해 소수 입력과 중간 계산을 이진 부동소수점 오차 없이 보존합니다. */
function fraction(numerator: bigint, denominator = BigInt(1)): Fraction {
  if (denominator === BigInt(0)) throw new Error('0으로 나눌 수 없습니다.');
  const sign = denominator < BigInt(0) ? BigInt(-1) : BigInt(1);
  let a = numerator < BigInt(0) ? -numerator : numerator;
  let b = denominator < BigInt(0) ? -denominator : denominator;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return {
    numerator: numerator * sign / a,
    denominator: denominator * sign / a
  };
}

/** 마지막 표시 단계에서만 소수점 12자리로 반올림하고 근삿값 여부를 함께 전달합니다. */
function decimal(value: Fraction): Extract<CalculatorResult, { ok: true }> {
  const negative = value.numerator < BigInt(0);
  const absolute = negative ? -value.numerator : value.numerator;
  const scale = BigInt(10) ** BigInt(12);
  const remainder = absolute * scale % value.denominator;
  const rounded = absolute * scale / value.denominator + (remainder * BigInt(2) >= value.denominator ? BigInt(1) : BigInt(0));
  const decimals = (rounded % scale).toString().padStart(12, '0').replace(/0+$/, '');
  const whole = rounded / scale;

  return {
    ok: true,
    value: `${negative && rounded !== BigInt(0) ? '-' : ''}${whole}${decimals ? `.${decimals}` : ''}`,
    approximate: remainder !== BigInt(0)
  };
}

/** 숫자·사칙연산·괄호만 직접 해석하며 eval 없이 우선순위와 음수·소수 계산을 처리합니다. */
export function evaluateExpression(input: string): CalculatorResult {
  if (!input.trim()) return {
    ok: false,
    error: '계산식을 입력해주세요.'
  };
  if (input.length > 256) return {
    ok: false,
    error: '계산식은 256자 이내로 입력해주세요.'
  };
  const expression = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
  let position = 0;
  let depth = 0;

  function peek() {
    while (/\s/.test(expression[position] ?? '') && position < expression.length) position++;
    return expression[position];
  }

  function factor(): Fraction {
    const next = peek();
    if (next === '+' || next === '-') {
      position++;
      const value = factor();
      return fraction(next === '-' ? -value.numerator : value.numerator, value.denominator);
    }
    if (next === '(') {
      position++;
      if (++depth > 32) throw new Error('괄호는 32단계 이내로 입력해주세요.');
      const value = sum();
      if (peek() !== ')') throw new Error('괄호의 짝을 확인해주세요.');
      position++;
      depth--;
      return value;
    }
    const number = expression.slice(position).match(/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/)?.[0];
    if (!number) throw new Error('숫자와 사칙연산 기호, 괄호를 확인해주세요.');
    const [whole, decimals = ''] = number.split('.');
    if (whole.length + decimals.length > 30) throw new Error('숫자 하나는 30자리 이내로 입력해주세요.');
    position += number.length;
    return fraction(BigInt(`${whole || '0'}${decimals}`), BigInt(10) ** BigInt(decimals.length));
  }

  function product(): Fraction {
    let value = factor();
    while (peek() === '*' || peek() === '/') {
      const operation = expression[position++];
      const right = factor();
      value = operation === '*'
        ? fraction(value.numerator * right.numerator, value.denominator * right.denominator)
        : fraction(value.numerator * right.denominator, value.denominator * right.numerator);
    }
    return value;
  }

  function sum(): Fraction {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const operation = expression[position++];
      const right = product();
      const numerator = value.numerator * right.denominator
        + (operation === '+' ? right.numerator : -right.numerator) * value.denominator;
      value = fraction(numerator, value.denominator * right.denominator);
    }
    return value;
  }

  try {
    const value = sum();
    if (peek() !== undefined) throw new Error('계산식을 확인해주세요. 천 단위 쉼표 없이 입력해주세요.');
    return decimal(value);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '계산식을 확인해주세요.'
    };
  }
}
