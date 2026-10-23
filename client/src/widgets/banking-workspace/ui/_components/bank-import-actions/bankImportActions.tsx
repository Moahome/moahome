'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties
} from 'react';
import { createPortal } from 'react-dom';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import styles from './bankImportActions.module.css';

/** 화면 폭에 맞춰 고정 작업바의 버튼 크기를 조절하며 선택 상태는 유지합니다. */
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia('(max-width: 767px)');
  query.addEventListener('change', onChange);

  return () => query.removeEventListener('change', onChange);
}

/** PC·모바일 모두 작업바를 고정하고 실제 높이·하단 여백만큼 본문 공간을 확보합니다. */
export function BankImportActions({ selectedCount, incomeCount, busy, onSave }: {
  selectedCount: number;
  incomeCount: number;
  busy: boolean;
  onSave: () => void;
}) {
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia('(max-width: 767px)').matches, () => false);
  const barRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    reservedHeight: 0,
    left: 16,
    width: 0
  });

  useLayoutEffect(() => {
    const bar = barRef.current;
    const slot = slotRef.current;
    if (!bar || !slot) return;
    // 사이드바 접힘·화면 회전에도 PC 작업바는 현재 본문 폭을 따르고 마지막 행은 가리지 않습니다.
    const measure = () => {
      const bounds = slot.getBoundingClientRect();
      const next = {
        reservedHeight: Math.ceil(bar.getBoundingClientRect().height + parseFloat(getComputedStyle(bar).bottom) + 16),
        left: bounds.left,
        width: bounds.width
      };
      setLayout((current) => current.reservedHeight === next.reservedHeight && current.left === next.left && current.width === next.width ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(slot);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, []);

  const bar = (
    <footer
      ref={barRef}
      className={styles.bar}
      aria-label={'선택 거래 저장'}
      style={{
        '--bar-left': `${layout.left}px`,
        '--bar-width': layout.width ? `${layout.width}px` : 'calc(100% - 32px)'
      } as CSSProperties}
    >
      <div
        className={styles.selection}
        role={'status'}
        aria-live={'polite'}
      >
        <strong>
          {selectedCount ? `선택한 거래 ${formatInteger(selectedCount)}건` : '거래를 선택해 주세요'}
        </strong>
        {selectedCount > 0 && (
          <span>
            {`입금 ${formatInteger(incomeCount)}건 · 출금 ${formatInteger(selectedCount - incomeCount)}건`}
          </span>
        )}
      </div>
      <Button
        className={styles['save-button']}
        size={mobile ? 'sm' : 'md'}
        disabled={!selectedCount || busy}
        loading={busy}
        onClick={onSave}
      >
        {busy ? '저장 중' : '선택 거래 저장'}
      </Button>
    </footer>
  );

  return (
    <div
      ref={slotRef}
      style={{
        height: layout.reservedHeight
      }}
    >
      {/* 컨테이너 쿼리의 포함 영역을 벗어나 PC·모바일 모두 화면 하단을 기준으로 고정합니다. */}
      {typeof document !== 'undefined' && createPortal(bar, document.body)}
    </div>
  );
}
