'use client';

import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject
} from 'react';
import { Button } from '@/shared/ui/button';
import styles from './unitDeleteConfirmation.module.css';

/** 세대·동·관리비 항목 삭제에 같은 확인 절차를 제공하고 중첩 창의 취소·포커스 복귀를 처리합니다. */
export function UnitDeleteConfirmation({
  label,
  title = '세대 삭제 확인',
  description,
  children,
  fallbackFocusRef,
  onConfirm,
  onClose,
}: {
  label: string;
  title?: string;
  description?: string;
  children?: ReactNode;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousDialog = previousFocus?.closest('dialog[open]');
    const fallbackFocus = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    // 편집·동 관리 창이 이미 스크롤을 잠갔다면 중첩 창이 그 잠금의 해제를 덮어쓰지 않습니다.
    const shouldLockBody = !document.querySelector('dialog[open]');
    dialog?.showModal();
    if (shouldLockBody) document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    return () => {
      dialog?.close();
      if (shouldLockBody) document.body.style.overflow = previousOverflow;
      // 삭제로 원래 버튼이 없어지면 목록 선택 버튼 또는 열린 관리 창으로 포커스를 돌립니다.
      const canRestoreFocus = previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.matches(':disabled');
      const nextFocus = canRestoreFocus ? previousFocus : (fallbackFocus ?? previousDialog?.querySelector<HTMLElement>('button:not(:disabled)'));
      nextFocus?.focus({
        preventScroll: true
      });
    };
  }, [fallbackFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      role={'alertdialog'}
      aria-labelledby={'unit-delete-title'}
      aria-describedby={description ? 'unit-delete-description unit-delete-note' : 'unit-delete-description'}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <h2
        id={'unit-delete-title'}
      >
        {title}
      </h2>
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
      <div
        className={styles.actions}
      >
        <Button
          ref={cancelRef}
          variant={'outline'}
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          variant={'outline'}
          className={styles['delete-button']}
          onClick={onConfirm}
        >
          삭제
        </Button>
      </div>
    </dialog>
  );
}
