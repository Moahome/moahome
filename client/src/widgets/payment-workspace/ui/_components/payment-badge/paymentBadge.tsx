import type { ReactNode } from 'react';
import styles from './paymentBadge.module.css';

/** 월별 수납의 목록과 상세는 동일한 납부 상태 색상을 사용합니다. */
export const MONTHLY_STATUS_TONES = {
  미납: 'danger',
  일부납부: 'warning',
  납부완료: 'success',
  '정산 확인 필요': 'neutral'
} as const;

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
