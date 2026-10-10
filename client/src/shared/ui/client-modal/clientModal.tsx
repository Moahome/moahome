'use client';

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type RefObject
} from 'react';

interface ClientModalProps extends Omit<ComponentPropsWithoutRef<'dialog'>, 'open' | 'onCancel' | 'onClose'> {
  onClose: () => void;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

/** 네이티브 모달의 포커스 제한·스크롤 잠금·중첩 닫기와 원래 조작 위치 복귀를 공통으로 처리합니다. */
export function ClientModal({
  onClose,
  busy = false,
  initialFocusRef,
  fallbackFocusRef,
  children,
  ...dialogProps
}: ClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousDialog = previousFocus?.closest('dialog[open]');
    const fallbackFocus = fallbackFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    // 중첩된 삭제 확인은 부모 모달이 소유한 스크롤 잠금을 해제하지 않습니다.
    const ownsScrollLock = !document.querySelector('dialog[open]');
    dialog?.showModal();
    if (ownsScrollLock) document.body.style.overflow = 'hidden';
    initialFocusRef?.current?.focus({
      preventScroll: true
    });

    return () => {
      dialog?.close();
      if (ownsScrollLock) document.body.style.overflow = previousOverflow;
      // 삭제로 이전 버튼이 사라졌거나 비활성화되면 지정한 대체 버튼·부모 창으로 돌아갑니다.
      const canRestoreFocus = previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.matches(':disabled');
      const nextFocus = canRestoreFocus ? previousFocus : (fallbackFocus ?? previousDialog?.querySelector<HTMLElement>('button:not(:disabled)'));
      nextFocus?.focus({
        preventScroll: true
      });
    };
  }, [initialFocusRef, fallbackFocusRef]);

  return (
    <dialog
      {...dialogProps}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
