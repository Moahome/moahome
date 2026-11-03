'use client';

import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import type { ExpenseDraft } from '../../model/allocationTypes';
import type { BankReceiptDraft } from '../../model/bankReceiptDraftTypes';
import { AllocationEditor } from '../allocation-editor/allocationEditor';
import styles from './bankImportEditor.module.css';

/** 운영 업로드와 초기 설정에서 동일한 입금 용도·세대 지정·지출 배분 입력을 사용합니다. */
export function BankImportEditor({ direction, amount, suggestedUnitId, units, buildings, receipt, expense, onReceiptChange, onExpenseChange, disabled = false }: {
  direction: string;
  amount: string;
  suggestedUnitId?: string;
  units: { id: string; label: string }[];
  buildings: { id: string; label: string }[];
  receipt: BankReceiptDraft;
  expense: ExpenseDraft;
  onReceiptChange: (draft: BankReceiptDraft) => void;
  onExpenseChange: (draft: ExpenseDraft) => void;
  disabled?: boolean;
}) {
  if (direction === 'EXPENSE' && !buildings.length) return (
    <div
      className={styles.editor}
    >
      <Input
        label={'지출명'}
        disabled={disabled}
        required
        value={expense.category}
        maxLength={100}
        onChange={(event) => onExpenseChange({
          ...expense,
          category: event.target.value,
          mode: 'PROPERTY',
          allocations: []
        })}
      />
      <Input
        label={'메모'}
        disabled={disabled}
        value={expense.note}
        maxLength={500}
        onChange={(event) => onExpenseChange({
          ...expense,
          note: event.target.value,
          mode: 'PROPERTY',
          allocations: []
        })}
      />
    </div>
  );
  if (direction === 'EXPENSE') return (
    <AllocationEditor
      total={amount}
      draft={expense}
      buildings={buildings}
      disabled={disabled}
      onChange={onExpenseChange}
    />
  );
  return (
    <fieldset
      className={styles.editor}
      disabled={disabled}
    >
      <legend>
        입금 분류
      </legend>
      <Dropdown
        label={'입금 용도'}
        value={receipt.kind}
        disabled={disabled}
        onChange={(kind) => onReceiptChange({
          ...receipt,
          kind: kind as BankReceiptDraft['kind']
        })}
        options={[
          {
            value: 'AUTO',
            label: '명단 일치 자동 수납 · 미일치는 확인 필요'
          },
          {
            value: 'HOUSEHOLD',
            label: '세대 관리비 직접 지정'
          },
          {
            value: 'OTHER',
            label: '외부 분담금·수리비 등 기타 입금'
          },
          {
            value: 'SHARED',
            label: '동별 입금 · 직접 배분'
          }
        ].filter((option) => option.value !== 'SHARED' || buildings.length > 0)}
      />
      {receipt.kind === 'AUTO' && (
        <p>
          {units.find((unit) => unit.id === suggestedUnitId)?.label ?? '일치하는 세대가 없어 확인이 필요합니다.'}
        </p>
      )}
      {receipt.kind === 'HOUSEHOLD' && (
        <Dropdown
          label={'수납 세대'}
          value={receipt.unitId}
          disabled={disabled}
          onChange={(unitId) => onReceiptChange({
            ...receipt,
            unitId
          })}
          options={units.map((unit) => ({
            value: unit.id,
            label: unit.label
          }))}
        />
      )}
      {receipt.kind === 'SHARED' && buildings.length > 0 && (
        <AllocationEditor
          purpose={'income'}
          total={amount}
          draft={expense}
          buildings={buildings}
          disabled={disabled}
          onChange={onExpenseChange}
        />
      )}
      {receipt.kind === 'OTHER' && (
        <>
          <Input
            label={'기타 입금 항목'}
            aria-label={'기타 입금 항목'}
            required
            maxLength={100}
            value={receipt.category}
            onChange={(event) => onReceiptChange({
              ...receipt,
              category: event.target.value
            })}
          />
          <Input
            label={'입금 메모'}
            maxLength={500}
            value={receipt.note}
            onChange={(event) => onReceiptChange({
              ...receipt,
              note: event.target.value
            })}
          />
        </>
      )}
    </fieldset>
  );
}
