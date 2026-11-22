'use client';

import type { RefObject } from 'react';
import { ModalCloseButton } from '@/shared/ui/client-modal';
import styles from './noticeDialog.module.css';

export function NoticeDialog({
  dialogRef,
  title,
  message,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  message: string;
}) {
  return (
    <dialog
      ref={dialogRef}
      className={styles['notice-dialog']}
      aria-labelledby={'notice-title'}
      aria-describedby={'notice-description'}
    >
      <header>
        <h2
          id={'notice-title'}
        >
          {title}
        </h2>
        <ModalCloseButton
          aria-label={`${title} 닫기`}
          onClick={() => dialogRef.current?.close()}
        />
      </header>
      <p
        id={'notice-description'}
      >
        {message}
      </p>
      <form
        method={'dialog'}
      >
        <button
          type={'submit'}
        >
          확인
        </button>
      </form>
    </dialog>
  );
}
