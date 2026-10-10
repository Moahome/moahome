import type { ReactNode } from 'react';
import styles from './listCard.module.css';

export function ListCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className={styles.card}
    >
      {children}
    </div>
  );
}
