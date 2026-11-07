import type { ReactNode } from 'react';
import styles from './summaryCard.module.css';

/** 호출자가 집계한 값과 의미 색상을 표시하며 업무 집계와 카드 배치는 화면에서 관리합니다. */
export function SummaryCard({
  label,
  shortLabel,
  value,
  unit,
  icon,
  tone = 'neutral',
  valueTone = 'neutral',
  density = 'comfortable',
  surface = 'card',
  description,
  help,
}: {
  label: string;
  shortLabel?: string;
  value: number | string;
  unit: string;
  icon: ReactNode;
  tone?: 'primary' | 'teal' | 'success' | 'neutral' | 'warning' | 'danger';
  valueTone?: 'neutral' | 'danger';
  density?: 'comfortable' | 'compact';
  surface?: 'card' | 'subtle';
  description?: string;
  help?: ReactNode;
}) {
  return (
    <article
      className={styles.card}
      data-tone={tone}
      data-value-tone={valueTone}
      data-density={density}
      data-surface={surface}
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
        <div
          className={styles.label}
        >
          {help}
          <span
            className={shortLabel ? styles['full-label'] : undefined}
          >
            {label}
          </span>
          {shortLabel && (
            <span
              className={styles['short-label']}
            >
              {shortLabel}
            </span>
          )}
        </div>
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
