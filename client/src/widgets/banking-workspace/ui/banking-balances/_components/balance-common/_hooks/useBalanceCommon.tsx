'use client';

import { useState } from 'react';
import {
  useEffect,
  useLayoutEffect,
  useRef
} from 'react';

/** PagedTable의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function usePagedTable(total: number) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const count = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, count);

  const changeSize = (value: string) => {
    setSize(Number(value));
    setPage(1);
  };

  return {
    setPage,
    size,
    count,
    current,
    changeSize
  };
}

/** OpeningBalanceAction의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useOpeningBalanceAction({
  missing,
  onOpen
}: { missing: boolean;
onOpen: () => void }) {

  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = missing ? '시작 잔고 설정' : '기준 잔고 확인';
  const [tooltipWidth, setTooltipWidth] = useState(400);

  // 버튼 왼쪽 정렬을 유지하고 화면 오른쪽에 남은 공간 안에서 설명 너비를 제한합니다.
  useLayoutEffect(() => {
    if (!open)
      return;
    const position = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds)
        return;
      setTooltipWidth(Math.min(400, window.innerWidth - 40, window.innerWidth - 21 - bounds.left));
    };
    position();
    window.addEventListener('resize', position);

    return () => window.removeEventListener('resize', position);
  }, [open]);

  useEffect(() => {
    if (!open)
      return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);

    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return {
    kind: 'ready' as const,
    missing,
    onOpen,
    root,
    open,
    setOpen,
    label,
    tooltipWidth
  };
}