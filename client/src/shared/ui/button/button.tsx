import type {
  ComponentPropsWithRef,
  ReactNode
} from 'react';
import styles from './button.module.css';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

/** 버튼의 색상·크기·포커스·비활성 표현을 공유하며 제출 여부와 클릭 처리는 호출자가 정합니다. */
export function Button({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  'aria-busy': ariaBusy,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={[styles.button, className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      disabled={disabled || loading}
      aria-busy={loading || ariaBusy}
    >
      {leadingIcon && (
        <span
          className={styles.icon}
          aria-hidden={'true'}
        >
          {leadingIcon}
        </span>
      )}
      {children}
      {trailingIcon && (
        <span
          className={styles.icon}
          aria-hidden={'true'}
        >
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
