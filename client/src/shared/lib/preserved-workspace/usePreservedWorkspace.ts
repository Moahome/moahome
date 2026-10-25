'use client';

import {
  useLayoutEffect,
  useRef,
  type RefObject
} from 'react';

/** 오류 안내로 화면을 가릴 때 DOM·입력은 유지하고 네이티브 최상위 창과 복귀 위치를 보관합니다. */
export function usePreservedWorkspace(suspended: boolean, workspaceRef: RefObject<HTMLDivElement | null>, errorRef: RefObject<HTMLElement | null>) {
  const scrollPosition = useRef({
    x: 0,
    y: 0
  });
  const focusedElement = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (suspended) return;
    /** 숨김으로 발생한 스크롤·포커스 이동은 작업 위치를 덮어쓰지 않습니다. */
    function rememberPosition() {
      if (!workspaceRef.current || workspaceRef.current.hidden) return;
      scrollPosition.current = {
        x: window.scrollX,
        y: window.scrollY
      };
    }
    function rememberFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement && workspaceRef.current?.contains(event.target)) {
        focusedElement.current = event.target;
      }
    }
    rememberPosition();
    window.addEventListener('scroll', rememberPosition);
    document.addEventListener('focusin', rememberFocus);
    return () => {
      window.removeEventListener('scroll', rememberPosition);
      document.removeEventListener('focusin', rememberFocus);
    };
  }, [suspended, workspaceRef]);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!suspended || !workspace) return;
    const dialogs = Array.from(workspace.querySelectorAll<HTMLDialogElement>('dialog[open]'));
    const popovers = Array.from(workspace.querySelectorAll<HTMLElement>('[popover]:popover-open'));
    const savedScroll = scrollPosition.current;
    const savedFocus = focusedElement.current;
    // top layer의 dialog·popover는 조상의 숨김만으로 남을 수 있어 표시만 닫습니다. React의 열림 상태는 유지합니다.
    for (const popover of [...popovers].reverse()) popover.hidePopover();
    for (const dialog of [...dialogs].reverse()) dialog.close();
    errorRef.current?.focus({
      preventScroll: true
    });
    return () => {
      // 숨김 속성이 제거된 다음 프레임에서 부모→자식 순서로 복원합니다. 실제 이동·권한 상실로 없어진 창은 열지 않습니다.
      requestAnimationFrame(() => {
        if (!workspace.isConnected || workspace.hidden) return;
        for (const dialog of dialogs) {
          if (dialog.isConnected && !dialog.open) dialog.showModal();
        }
        for (const popover of popovers) {
          if (popover.isConnected && popover.hasAttribute('popover') && !popover.matches(':popover-open')) popover.showPopover();
        }
        window.scrollTo(savedScroll.x, savedScroll.y);
        if (savedFocus?.isConnected) savedFocus.focus({
          preventScroll: true
        });
      });
    };
  }, [suspended, workspaceRef, errorRef]);
}
