"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { FormField, getFieldDescription, type FormFieldOptions } from "../form-field/formField";
import styles from "./input.module.css";

export interface InputProps extends Omit<ComponentPropsWithRef<"input">, "children">, FormFieldOptions {
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
  type = "text",
  required,
  disabled,
  readOnly,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...inputProps
}: InputProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const invalid = error ? true : ariaInvalid;
  const describedBy = getFieldDescription({ controlId, description, error, describedBy: ariaDescribedBy });

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
          className={styles["leading-icon"]}
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      )}
      <input
        {...inputProps}
        id={controlId}
        type={type}
        className={[styles.input, className].filter(Boolean).join(" ")}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-describedby={describedBy}
        aria-invalid={invalid}
      />
      {trailingContent != null && (
        <span
          className={styles["trailing-content"]}
        >
          {trailingContent}
        </span>
      )}
    </FormField>
  );
}
