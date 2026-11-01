'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../button';
import { ServiceIcon } from '../service-icon';
import styles from './infoTooltip.module.css';

/** 짧은 도움말을 버튼 주변의 화면 안에 열고 마우스·키보드·터치에서 같은 닫기 동작을 제공합니다. */
export function InfoTooltip({ label, title, children, note, size = 'md', compact = false }: {
  label: string;
  title?: string;
  children: ReactNode;
  note?: string;
  size?: 'sm' | 'md';
  compact?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 360,
    maxHeight: 480
  });

  /** 상위 모달을 이벤트 시점에 찾아 같은 최상위 레이어에 도움말을 표시합니다. */
  function showTooltip() {
    setTarget(root.current?.closest<HTMLDialogElement>('dialog[open]') ?? document.body);
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const panel = tooltip.current;
      if (!panel) return;
      // 모달 도움말은 같은 네이티브 모달에 표시하고 모달·뷰포트의 안쪽 경계에서 위치를 정합니다.
      const dialog = root.current?.closest('dialog[open]')?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? document.documentElement.clientWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const leftEdge = Math.max(viewportLeft + 20, dialog ? dialog.left + 12 : viewportLeft + 20);
      const rightEdge = Math.min(viewportRight - 20, dialog ? dialog.right - 12 : viewportRight - 20);
      const topEdge = Math.max(viewportTop + 12, dialog ? dialog.top + 12 : viewportTop + 12);
      const bottomEdge = Math.min(viewportBottom - 12, dialog ? dialog.bottom - 12 : viewportBottom - 12);
      const width = Math.min(360, rightEdge - leftEdge);
      const maxHeight = Math.max(40, bottomEdge - topEdge);
      // 폭을 먼저 반영해 좁은 화면에서 줄바꿈된 실제 도움말 높이로 위·아래 공간을 비교합니다.
      panel.style.setProperty('--tooltip-width', `${width}px`);
      panel.style.setProperty('--tooltip-max-height', `${maxHeight}px`);
      const height = Math.min(panel.getBoundingClientRect().height, maxHeight);
      const below = bounds.bottom + 10;
      const above = bounds.top - height - 10;
      const preferredTop = below + height <= bottomEdge ? below : above;
      setPosition({
        left: Math.max(leftEdge, Math.min(bounds.left, rightEdge - width)),
        top: Math.max(topEdge, Math.min(preferredTop, bottomEdge - height)),
        width,
        maxHeight
      });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (tooltip.current) observer.observe(tooltip.current);
    window.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !tooltip.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 도움말을 먼저 닫고 같은 Escape로 부모 네이티브 모달까지 취소되는 것을 막습니다.
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={styles.root}
      onMouseEnter={showTooltip}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget)) return;
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={showTooltip}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Button
        className={styles.trigger}
        data-help-size={size}
        variant={'ghost'}
        iconOnly
        aria-label={label}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        onClick={showTooltip}
        leadingIcon={(
          <ServiceIcon
            name={'info'}
          />
        )}
      />
      {open && target && createPortal(
        <div
          ref={tooltip}
          id={tooltipId}
          role={'tooltip'}
          data-help-size={size}
          data-compact={compact || undefined}
          className={styles.tooltip}
          style={{
            '--tooltip-left': `${position.left}px`,
            '--tooltip-top': `${position.top}px`,
            '--tooltip-width': `${position.width}px`,
            '--tooltip-max-height': `${position.maxHeight}px`
          } as CSSProperties}
          onMouseEnter={showTooltip}
          onMouseLeave={(event) => {
            if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget)) return;
            if (!root.current?.contains(document.activeElement)) setOpen(false);
          }}
        >
          <span
            className={styles.icon}
            aria-hidden={'true'}
          >
            <ServiceIcon
              name={'info'}
            />
          </span>
          <div
            className={styles.content}
          >
            {title && (
              <strong>
                {title}
              </strong>
            )}
            <p>
              {children}
            </p>
            {note && (
              <small>
                {note}
              </small>
            )}
          </div>
        </div>,
        target
      )}
    </div>
  );
}
