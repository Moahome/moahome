'use client';

import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent
} from 'react';
import { formatInteger } from '@/shared/lib/format';
import {
  Input,
  type InputProps
} from '../input/input';
import styles from './amountInput.module.css';

export interface AmountInputProps extends Omit<InputProps, 'value' | 'defaultValue' | 'onChange' | 'digitsOnly' | 'type' | 'pattern' | 'inputMode'> {
  value: string;
  onChange: (value: string) => void;
}

/** 빈칸과 입력 중 음수 부호는 그대로 두어 금액 확정 전에도 자연스럽게 입력하게 합니다. */
function formatEditingAmount(value: string): string {
  if (value === '' || value === '-') return value;

  return formatInteger(value);
}

/** 숫자와 부호 기준의 커서 위치를 표시 문자열로 옮겨 콤마 추가·삭제 때 끝으로 튀지 않게 합니다. */
function getDisplayPosition(display: string, rawPosition: number): number {
  let position = 0;
  let characters = 0;
  while (position < display.length && characters < rawPosition) {
    if (display[position] !== ',') characters++;
    position++;
  }

  return position;
}

/** 표시값에는 콤마를 넣고 변경 콜백에는 정수 문자열만 전달하며 범위 검증은 호출 화면에 맡깁니다. */
export function AmountInput({
  value,
  onChange,
  onKeyDown,
  onPaste,
  className,
  ...inputProps
}: AmountInputProps) {
  const displayValue = formatEditingAmount(value);

  /** 편집 직후 표시값과 선택 영역을 함께 반영해 중간 입력·범위 선택에서도 커서를 보존합니다. */
  function applyValue(input: HTMLInputElement, raw: string, start: number, end = start) {
    const display = formatEditingAmount(raw);
    const direction = input.selectionDirection ?? 'none';
    input.value = display;
    input.setSelectionRange(getDisplayPosition(display, start), getDisplayPosition(display, end), direction);
    onChange(raw);
  }

  /** 소수·문자 입력을 다른 금액으로 바꾸지 않고 거부하며 콤마만 표시 구분자로 처리합니다. */
  function changeAmount(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const edited = input.value;
    const start = input.selectionStart ?? edited.length;
    const end = input.selectionEnd ?? start;
    const raw = edited.replaceAll(',', '');
    if (!/^-?[0-9]*$/.test(raw)) {
      input.value = displayValue;
      input.setSelectionRange(Math.min(start, displayValue.length), Math.min(end, displayValue.length));
      return;
    }

    applyValue(input, raw, edited.slice(0, start).replaceAll(',', '').length, edited.slice(0, end).replaceAll(',', '').length);
  }

  /** 콤마 경계의 Backspace·Delete는 인접 숫자를 지워 같은 콤마가 계속 복원되는 동작을 막습니다. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

    const input = event.currentTarget;
    if (input.readOnly || input.disabled) return;
    const start = input.selectionStart;
    if (start === null || start !== input.selectionEnd) return;

    const backward = event.key === 'Backspace' && displayValue[start - 1] === ',';
    const forward = event.key === 'Delete' && displayValue[start] === ',';
    if (!backward && !forward) return;

    event.preventDefault();
    const rawPosition = displayValue.slice(0, start).replaceAll(',', '').length;
    const removeAt = backward ? rawPosition - 1 : rawPosition;
    const nextValue = value.slice(0, removeAt) + value.slice(removeAt + 1);
    applyValue(input, nextValue, removeAt);
  }

  /** 붙여넣기는 정수 또는 올바른 천 단위 구분만 허용해 잘못된 콤마를 조용히 제거하지 않습니다. */
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    if (!/^-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(event.clipboardData.getData('text'))) event.preventDefault();
  }

  return (
    <Input
      {...inputProps}
      className={[styles.input, className].filter(Boolean).join(' ')}
      type={'text'}
      inputMode={'text'}
      pattern={'-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)'}
      value={displayValue}
      onChange={changeAmount}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}
