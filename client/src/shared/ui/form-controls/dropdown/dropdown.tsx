"use client";

import { useId, type ComponentPropsWithRef } from "react";
import { FormField, getFieldDescription, type FormFieldOptions } from "../form-field/formField";
import styles from "./dropdown.module.css";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps extends Omit<ComponentPropsWithRef<"select">, "children" | "multiple" | "size" | "value" | "defaultValue">, FormFieldOptions {
  options: readonly DropdownOption[];
  placeholder?: string;
  value?: string;
  defaultValue?: string;
}

/** 기본 select로 키보드·모바일 선택을 지원하고 라벨과 안내·오류를 연결합니다. */
export function Dropdown({
  id,
  label,
  description,
  error,
  fieldClassName,
  className,
  options,
  placeholder = "선택해주세요",
  value,
  defaultValue,
  required,
  disabled,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...selectProps
}: DropdownProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const invalid = error ? true : ariaInvalid;
  const describedBy = getFieldDescription({ controlId, description, error, describedBy: ariaDescribedBy });
  const initialValue = value === undefined ? defaultValue ?? (placeholder ? "" : undefined) : undefined;

  return (
    <FormField
      controlId={controlId}
      label={label}
      description={description}
      error={error}
      fieldClassName={fieldClassName}
      required={required}
      disabled={disabled}
      invalid={invalid}
    >
      <select
        {...selectProps}
        id={controlId}
        className={[styles.dropdown, className].filter(Boolean).join(" ")}
        value={value}
        defaultValue={initialValue}
        required={required}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
      >
        {placeholder && (
          <option
            value=""
            disabled={required}
          >
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <svg
        className={styles["dropdown-icon"]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="m6 9 6 6 6-6"
        />
      </svg>
    </FormField>
  );
}
