'use client';

import {
  useId,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './downloadLayout.module.css';

/** 자료·형식별 처리는 호출자가 맡고 모든 다운로드의 헤더·본문·푸터와 표시 방식을 통일합니다. */
export function DownloadLayout({ title, description, children, footer, presentation = 'modal', busy = false, closeLabel = '다운로드 미리보기 닫기', onClose }: {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  presentation?: 'modal' | 'page';
  busy?: boolean;
  closeLabel?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={titleId}
          >
            {title}
          </h2>
          {description && (
            <p
              id={descriptionId}
            >
              {description}
            </p>
          )}
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
          >
            <ServiceIcon
              name={'close'}
            />
          </Button>
        )}
      </header>
      <div
        className={styles.body}
      >
        {children}
      </div>
      <footer
        className={styles.footer}
      >
        {footer}
      </footer>
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      {content}
    </ClientModal>
  );
}
