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

/** 짧은 도움말을 버튼 아래에 열고 마우스·키보드·터치에서 같은 내용과 닫기 동작을 제공합니다. */
export function InfoTooltip({ label, title, children, note, size = 'md' }: {
  label: string;
  title: string;
  children: ReactNode;
  note?: string;
  size?: 'sm' | 'md';
}) {
  const root = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 360
  });

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      // 조상의 스크롤·잘라내기 영역을 벗어나 화면 좌표로 표시하고 오른쪽 경계를 제한합니다.
      const viewportWidth = document.documentElement.clientWidth;
      const width = Math.min(360, viewportWidth - 40);
      const left = Math.max(20, Math.min(bounds.left, viewportWidth - width - 20));
      setPosition({
        left,
        top: bounds.bottom + 10,
        width
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !tooltip.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget)) return;
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
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
        onClick={() => setOpen(true)}
        leadingIcon={(
          <ServiceIcon
            name={'info'}
          />
        )}
      />
      {open && createPortal(
        <div
          ref={tooltip}
          id={tooltipId}
          role={'tooltip'}
          className={styles.tooltip}
          style={{
            '--tooltip-left': `${position.left}px`,
            '--tooltip-top': `${position.top}px`,
            '--tooltip-width': `${position.width}px`
          } as CSSProperties}
          onMouseEnter={() => setOpen(true)}
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
            <strong>
              {title}
            </strong>
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
        document.body
      )}
    </div>
  );
}
