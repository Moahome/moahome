'use client';

import {
  useState,
  useEffect
} from 'react';
import { AllocationEditor } from '../allocation-editor/allocationEditor';
import {
  calculateExpenseAllocation,
  sortExpenseLabels
} from '../../model/allocation';
import type { ExpenseDraft } from '../../model/allocationTypes';
import type { TransferAllocationPart } from '../../model/transferAllocationTypes';
import { calculateTransferAllocation } from '../../model/transferAllocation';

/** 기존 배분 편집기로 선택 동·균등·비율·금액을 확인하며 저장에는 확정된 동별 금액만 전달합니다. */
export function TransferAllocationEditor({ total, buildings, value, onChange, disabled = false, limits }: {
  limits?: Readonly<Record<string, string | null>>;
  total: string;
  buildings: readonly { id: string; label: string }[];
  value: readonly TransferAllocationPart[];
  onChange: (value: TransferAllocationPart[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    category: '통장간 거래',
    note: '',
    mode: value.length ? 'AMOUNT' : 'EQUAL',
    saveAsRule: false,
    allocations: sortExpenseLabels((value.length ? value : buildings.map((building) => ({
      buildingId: building.id,
      amount: ''
    }))).map((part) => ({
      ...part,
      label: buildings.find((building) => building.id === part.buildingId)?.label ?? '동',
      percentage: null
    })))
  }));
  const calculated = calculateExpenseAllocation(total, draft, 'income');
  const allocation = calculateTransferAllocation(total, calculated.allocations.filter((part) => part.buildingId).map((part) => ({
    buildingId: part.buildingId!,
    amount: part.amount
  })), buildings.length > 0, limits);
  // 한도 조회·통장 변경 시에도 다시 검증해 이전 통장의 유효한 배분으로 저장 버튼이 열리지 않게 합니다.
  useEffect(() => {
    const next = calculated.error || allocation.error ? [] : allocation.allocations;
    if (JSON.stringify(next) !== JSON.stringify(value)) onChange(next);
  }, [calculated.error, allocation.error, allocation.allocations, value, onChange]);

  function change(next: ExpenseDraft) {
    setDraft(next);
  }
  return (
    <AllocationEditor
      purpose={'transfer'}
      total={total}
      draft={draft}
      buildings={[...buildings]}
      onChange={change}
      disabled={disabled}
      showDetails={false}
      showRule={false}
      compact
      limits={limits}
      validationError={allocation.error}
    />
  );
}
