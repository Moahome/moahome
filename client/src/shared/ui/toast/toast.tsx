'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import styles from './toast.module.css';

/** 성공 알림을 잠시 표시하며 모달 위에서도 읽을 수 있도록 현재 열린 모달 안에 배치합니다. */
export function Toast({
  message,
  onClose,
  duration = 4000,
}: {
  message: string;
  onClose: () => void;
  duration?: number;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose);

  useEffect(() => {
    // 네이티브 dialog 밖의 요소는 inert가 되므로 최상위 열린 모달로 알림을 옮깁니다.
    // 모달이 닫히면 body로 복귀해 성공 알림이 함께 사라지지 않도록 합니다.
    function updateTarget() {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      setTarget(dialogs.item(dialogs.length - 1) ?? document.body);
    }
    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open']
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // 마우스·포커스나 부모 재렌더링과 관계없이 표시 시간을 지키고 퇴장 애니메이션을 시작합니다.
    const timer = window.setTimeout(() => setLeaving(true), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => closeRef.current(), 180);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!target) return null;

  return createPortal(
    <div
      className={styles.toast}
      aria-label={'알림'}
      data-leaving={leaving}
    >
      <p
        role={'status'}
        aria-atomic={'true'}
      >
        {message}
      </p>
    </div>,
    target
  );
}
