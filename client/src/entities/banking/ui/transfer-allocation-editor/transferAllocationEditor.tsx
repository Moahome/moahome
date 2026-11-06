'use client';

import {
  useState,
  useEffect,
  useRef
} from 'react';
import { AllocationEditor } from '../allocation-editor/allocationEditor';
import {
  calculateExpenseAllocation,
  sortExpenseLabels
} from '../../model/allocation';
import type { ExpenseDraft } from '../../model/allocationTypes';
import type { TransferAllocationPart } from '../../model/transferAllocationTypes';

/** 기존 배분 편집기로 선택 동·균등·비율·금액을 확인하며 저장에는 확정된 동별 금액만 전달합니다. */
export function TransferAllocationEditor({ total, buildings, value, onChange, disabled = false }: {
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
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (value.length) return;
    const calculated = calculateExpenseAllocation(total, draft, 'income');
    onChange(calculated.error ? [] : calculated.allocations.filter((part) => part.buildingId).map((part) => ({
      buildingId: part.buildingId!,
      amount: part.amount
    })));
  }, [total, draft, value, onChange]);

  function change(next: ExpenseDraft) {
    setDraft(next);
    const calculated = calculateExpenseAllocation(total, next, 'income');
    onChange(calculated.error ? [] : calculated.allocations.filter((part) => part.buildingId).map((part) => ({
      buildingId: part.buildingId!,
      amount: part.amount
    })));
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
    />
  );
}
