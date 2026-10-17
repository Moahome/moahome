import type { ReactNode } from 'react';
import styles from './summaryCard.module.css';

/** 호출자가 집계한 값과 의미 색상을 표시하며 업무 집계와 카드 배치는 화면에서 관리합니다. */
export function SummaryCard({
  label,
  value,
  unit,
  icon,
  tone = 'neutral',
  density = 'comfortable',
  description,
}: {
  label: string;
  value: number | string;
  unit: string;
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'neutral' | 'warning' | 'danger';
  density?: 'comfortable' | 'compact';
  description?: string;
}) {
  return (
    <article
      className={styles.card}
      data-tone={tone}
      data-density={density}
      aria-label={`${label} ${value}${unit}`}
    >
      <span
        className={styles.icon}
        aria-hidden={'true'}
      >
        {icon}
      </span>
      <div
        className={styles.content}
      >
        <p>
          {label}
        </p>
        <div
          className={styles.value}
        >
          <strong>
            {value}
          </strong>
          <span
            className={styles.unit}
          >
            {unit}
          </span>
        </div>
        {description && (
          <small
            className={styles.description}
          >
            {description}
          </small>
        )}
      </div>
    </article>
  );
}
