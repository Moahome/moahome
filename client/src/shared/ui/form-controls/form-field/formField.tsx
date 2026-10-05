import type {
  AriaAttributes,
  ReactNode
} from 'react';
import styles from './formField.module.css';

export interface FormFieldOptions {
  label?: string;
  description?: string;
  error?: string;
  fieldClassName?: string;
}

interface FormFieldProps extends FormFieldOptions {
  controlId: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: AriaAttributes['aria-invalid'];
  children: ReactNode;
}

/** 호출자가 연결한 설명과 필드 안내·오류를 함께 읽을 수 있도록 ID를 합칩니다. */
export function getFieldDescription({
  controlId,
  description,
  error,
  describedBy,
}: {
  controlId: string;
  description?: string;
  error?: string;
  describedBy?: string;
}) {
  const descriptionIds = [
    describedBy,
    description ? `${controlId}-description` : undefined,
    error ? `${controlId}-error` : undefined,
  ];

  return descriptionIds.filter(Boolean).join(' ') || undefined;
}

/** 입력과 선택 필드의 라벨·필수 표시·안내·오류를 동일한 구조로 표시합니다. */
export function FormField({
  controlId,
  label,
  description,
  error,
  fieldClassName,
  required,
  disabled,
  readOnly,
  invalid,
  children,
}: FormFieldProps) {
  const isInvalid = invalid !== undefined && invalid !== false && invalid !== 'false';

  return (
    <div
      className={[styles.field, fieldClassName].filter(Boolean).join(' ')}
      data-disabled={disabled || undefined}
    >
      {label && (
        <label
          id={`${controlId}-label`}
          className={styles.label}
          htmlFor={controlId}
        >
          {label}
          {required && (
            <span
              className={styles.required}
              aria-hidden={'true'}
            >
              *
            </span>
          )}
        </label>
      )}
      <div
        className={styles.control}
        data-invalid={isInvalid || undefined}
        data-disabled={disabled || undefined}
        data-read-only={readOnly || undefined}
      >
        {children}
      </div>
      {description && (
        <p
          id={`${controlId}-description`}
          className={styles.description}
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={`${controlId}-error`}
          className={styles.error}
          role={'alert'}
        >
          {error}
        </p>
      )}
    </div>
  );
}
