'use client';

import {
  useId,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './billingAccordion.module.css';

/** 접힌 내용을 접근성 트리에서 제외하면서 열림·닫힘 애니메이션을 끝까지 유지합니다. */
export function BillingAccordion({ title, summary, children, defaultOpen = false }: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={styles.accordion}
      data-open={open}
    >
      <Button
        variant={'ghost'}
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>
          {title}
        </span>
        <span
          className={styles.summary}
        >
          {summary}
        </span>
        <ServiceIcon
          name={'chevron'}
          direction={'down'}
          size={18}
          className={styles.chevron}
        />
      </Button>
      <div
        id={id}
        role={'region'}
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
        className={styles.panel}
      >
        <div
          className={styles.inner}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
