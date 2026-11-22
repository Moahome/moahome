'use client';

import {
  useRef,
  type ReactNode,
  type RefObject
} from 'react';
import { Button } from '@/shared/ui/button';
import {
  ModalCloseButton,
  ClientModal
} from '@/shared/ui/client-modal';
import styles from './unitDeleteConfirmation.module.css';

/** 세대·동·관리비 항목 삭제에 같은 확인 절차를 제공하고 중첩 창의 닫기·포커스 복귀를 처리합니다. */
export function UnitDeleteConfirmation({
  label,
  title = '세대 삭제 확인',
  description,
  children,
  fallbackFocusRef,
  onConfirm,
  onClose,
  busy = false,
  errorMessage = '',
}: {
  label: string;
  title?: string;
  description?: string;
  children?: ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  errorMessage?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <ClientModal
      initialFocusRef={closeRef}
      fallbackFocusRef={fallbackFocusRef}
      onClose={onClose}
      busy={busy}
      className={styles.dialog}
      role={'alertdialog'}
      aria-labelledby={'unit-delete-title'}
      aria-describedby={description ? 'unit-delete-description unit-delete-note' : 'unit-delete-description'}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'unit-delete-title'}
        >
          {title}
        </h2>
        <ModalCloseButton
          ref={closeRef}
          aria-label={`${title} 닫기`}
          disabled={busy}
          onClick={onClose}
        />
      </header>
      <p
        id={'unit-delete-description'}
      >
        <strong>
          {label}
        </strong>
        를 삭제할까요?
      </p>
      {description && (
        <p
          id={'unit-delete-note'}
        >
          {description}
        </p>
      )}
      {children}
      {errorMessage && (
        <p
          className={styles.error}
          role={'alert'}
        >
          {errorMessage}
        </p>
      )}
      <div
        className={styles.actions}
      >

        <Button
          variant={'outline'}
          tone={'danger'}
          loading={busy}
          onClick={onConfirm}
        >
          삭제
        </Button>
      </div>
    </ClientModal>
  );
}
