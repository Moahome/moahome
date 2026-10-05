'use client';

import {
  useId,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type ReactNode
} from 'react';
import {
  FormField,
  getFieldDescription,
  type FormFieldOptions
} from '../form-field/formField';
import styles from './input.module.css';

export interface InputProps extends Omit<ComponentPropsWithRef<'input'>, 'children'>, FormFieldOptions {
  digitsOnly?: boolean;
  leadingIcon?: ReactNode;
  trailingContent?: ReactNode;
}

/** 고유한 필드 ID로 라벨과 안내를 연결하고 기본 input 속성과 ref를 전달합니다. */
export function Input({
  id,
  label,
  description,
  error,
  fieldClassName,
  className,
  leadingIcon,
  trailingContent,
  digitsOnly = false,
  type = 'text',
  required,
  disabled,
  readOnly,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...inputProps
}: InputProps) {
  const generatedId = useId();
  const acceptedValueRef = useRef(String(inputProps.value ?? inputProps.defaultValue ?? ''));
  const controlId = id ?? generatedId;
  const invalid = error ? true : ariaInvalid;
  const describedBy = getFieldDescription({
    controlId,
    description,
    error,
    describedBy: ariaDescribedBy
  });

  /** 숫자 전용 입력은 잘못된 타이핑·붙여넣기를 거부하고 기존 값을 유지해 다른 번호로 조용히 바꾸지 않습니다. */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (digitsOnly && !/^[0-9]*$/.test(event.currentTarget.value)) {
      event.currentTarget.value = String(inputProps.value ?? acceptedValueRef.current);
      return;
    }

    acceptedValueRef.current = event.currentTarget.value;
    inputProps.onChange?.(event);
  }

  return (
    <FormField
      controlId={controlId}
      label={label}
      description={description}
      error={error}
      fieldClassName={fieldClassName}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      invalid={invalid}
    >
      {leadingIcon && (
        <span
          className={styles['leading-icon']}
          aria-hidden={'true'}
        >
          {leadingIcon}
        </span>
      )}
      <input
        {...inputProps}
        id={controlId}
        type={digitsOnly ? 'text' : type}
        inputMode={digitsOnly ? 'numeric' : inputProps.inputMode}
        pattern={digitsOnly ? '[0-9]*' : inputProps.pattern}
        onChange={handleChange}
        className={[styles.input, className].filter(Boolean).join(' ')}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-describedby={describedBy}
        aria-invalid={invalid}
      />
      {trailingContent != null && (
        <span
          className={styles['trailing-content']}
        >
          {trailingContent}
        </span>
      )}
    </FormField>
  );
}
