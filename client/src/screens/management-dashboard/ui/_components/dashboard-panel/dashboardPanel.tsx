import Link from 'next/link';
import type { ReactNode } from 'react';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './dashboardPanel.module.css';

export function DashboardPanel({ title, href, linkLabel = '전체 내역', note, children }: {
  title: string;
  href?: string;
  linkLabel?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={styles.panel}
      aria-label={title}
    >
      <header
        className={styles.heading}
      >
        <h2>
          {title}
        </h2>
        {note && <span>
          {note}
        </span>}
        {href && (
          <Link
            href={href}
            aria-label={`${title} ${linkLabel}`}
          >
            {linkLabel}
            <ServiceIcon
              name={'chevron'}
              size={16}
            />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
