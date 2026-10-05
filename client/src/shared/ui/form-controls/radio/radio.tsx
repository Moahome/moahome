'use client';

import {
  useId,
  type ComponentPropsWithRef
} from 'react';
import styles from './radio.module.css';

export interface RadioProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'children'> {
  label: string;
  description?: string;
  variant?: 'plain' | 'card';
  fieldClassName?: string;
}

/** 기본 radio의 그룹·키보드·필수 검증을 유지하며 일반형과 설명이 있는 카드형 선택을 공유합니다. */
export function Radio({
  id,
  label,
  description,
  variant = 'plain',
  fieldClassName,
  className,
  'aria-describedby': ariaDescribedBy,
  ...inputProps
}: RadioProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <label
      className={[styles.radio, fieldClassName].filter(Boolean).join(' ')}
      data-variant={variant}
      htmlFor={controlId}
    >
      <input
        {...inputProps}
        id={controlId}
        type={'radio'}
        className={className}
        aria-describedby={describedBy}
      />
      <span
        className={styles.copy}
      >
        <span
          className={styles.label}
        >
          {label}
        </span>
        {description && (
          <span
            id={descriptionId}
            className={styles.description}
          >
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
