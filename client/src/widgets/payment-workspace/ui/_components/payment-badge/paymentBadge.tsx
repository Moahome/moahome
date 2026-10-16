import type { ReactNode } from 'react';
import styles from './paymentBadge.module.css';

/** 거래·수납 표에서 세대 후보와 처리 상태를 동일한 의미 색상으로 구분합니다. */
export function PaymentBadge({ tone, children }: {
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'teal';
  children: ReactNode;
}) {
  return (
    <span
      className={styles.badge}
      data-tone={tone}
    >
      {children}
    </span>
  );
}
