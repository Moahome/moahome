'use client';

import type { RefObject } from 'react';
import type { CalculatorResult } from '@/shared/lib/calculator';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './basicCalculator.module.css';

const KEYS = [
  ['C', '전체 지우기'], ['(', '여는 괄호'], [')', '닫는 괄호'], ['⌫', '한 글자 지우기'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '나누기'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '곱하기'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['−', '빼기'],
  ['0', '0'], ['.', '소수점'], ['=', '계산하기'], ['+', '더하기']
];

/** 일반 계산은 계산식·결과만 편집하며 업무 입력이나 저장 기능을 호출하지 않습니다. */
export function BasicCalculator({ expression, result, inputRef, onChange, onCalculate, onCopy }: {
  expression: string;
  result: CalculatorResult | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (expression: string) => void;
  onCalculate: () => void;
  onCopy: (value: string) => void;
}) {
  const [whole, decimals] = result?.ok ? result.value.split('.') : ['0'];
  const display = `${formatInteger(whole)}${decimals ? `.${decimals}` : ''}`;

  /** 키패드는 현재 선택 영역에 삽입하고 지우기는 선택 영역 또는 앞 한 글자만 제거합니다. */
  function pressKey(key: string) {
    if (key === '=') {
      onCalculate();
      return;
    }
    if (key === 'C') {
      onChange('');
      return;
    }
    const input = inputRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? start;
    const removeStart = key === '⌫' && start === end ? Math.max(0, start - 1) : start;
    const insert = key === '⌫' ? '' : key;
    const next = expression.slice(0, removeStart) + insert + expression.slice(end);
    if (next.length > 256) return;
    onChange(next);
    // 터치 키패드에서 시스템 키보드를 강제로 열지 않고 다음 편집 위치만 보존합니다.
    requestAnimationFrame(() => input?.setSelectionRange(removeStart + insert.length, removeStart + insert.length));
  }

  return (
    <div
      className={styles.calculator}
    >
      <Input
        ref={inputRef}
        label={'계산식'}
        value={expression}
        maxLength={256}
        placeholder={'예: 1500000 ÷ 17'}
        inputMode={'decimal'}
        autoComplete={'off'}
        spellCheck={false}
        error={result && !result.ok ? result.error : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onCalculate();
        }}
      />
      <div
        className={styles.result}
      >
        <output
          aria-label={'계산 결과'}
          aria-live={'polite'}
        >
          <span>
            {display}
          </span>
        </output>
        {result?.ok && result.approximate && (
          <p>
            소수점 12자리까지 반올림한 값입니다.
          </p>
        )}
      </div>
      <div
        className={styles.keypad}
        role={'group'}
        aria-label={'계산기 키패드'}
      >
        {KEYS.map(([key, label]) => (
          <Button
            key={key}
            variant={key === '=' ? 'primary' : 'outline'}
            aria-label={label}
            data-operation={['÷', '×', '−', '+', '='].includes(key)}
            onClick={() => pressKey(key)}
          >
            {key}
          </Button>
        ))}
      </div>
      <Button
        variant={'outline'}
        disabled={!result?.ok}
        onClick={() => { if (result?.ok) onCopy(result.value); }}
        leadingIcon={(
          <ServiceIcon
            name={'copy'}
          />
        )}
      >
        결과 복사
      </Button>
    </div>
  );
}
