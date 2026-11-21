'use client';

import { useState } from 'react';
import type { BalanceBuilding } from '../../../../../api/bankingBalanceApiTypes';
/** ChartDialog의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useChartDialog({
  buildings,
  onClose,
  presentation = 'modal'
}: { buildings: readonly BalanceBuilding[];
onClose: () => void;
presentation?: 'modal' | 'page' }) {

  const [building, setBuilding] = useState('ALL');
  const rows = buildings.filter((row) => building === 'ALL' || row.id === building);

  return {
    kind: 'ready' as const,
    buildings,
    onClose,
    presentation,
    building,
    setBuilding,
    rows
  };
}
