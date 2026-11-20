import type { ReactNode } from 'react';
import styles from './listCard.module.css';

export function ListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[styles.card, className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
