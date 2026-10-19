'use client';

import { FEE_ITEM_OPTIONS } from '@/entities/billing';
import { Button } from '@/shared/ui/button';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { getFeeItemErrors } from '../../../model/feeItems';
import type {
  FeeItemDraft,
  FeeItemErrors
} from '../../../model/feeItemsTypes';
import styles from './feeItemEditor.module.css';

const DIRECT_INPUT = 'direct-input';
const FEE_KIND_OPTIONS = [
  ...FEE_ITEM_OPTIONS,
  {
    value: DIRECT_INPUT,
    label: '직접 입력'
  }
];

/** 항목 편집은 확인 전까지 로컬 입력으로 두고 취소·Escape에서 목록과 금액을 보존합니다. */
export function FeeItemEditor({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: FeeItemDraft | null;
  onSave: (item: FeeItemDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const kindRef = useRef<HTMLButtonElement>(null);
  const [feeKind, setFeeKind] = useState(item ? item.itemCode ?? DIRECT_INPUT : '');
  const [itemName, setItemName] = useState(item?.itemCode ? '' : item?.itemName ?? '');
  const [defaultAmount, setDefaultAmount] = useState(item?.defaultAmount ?? '');
  // 모달의 초기 자동 포커스 이동은 검증으로 취급하지 않으며 종류 미선택 오류는 제출 시에만 표시합니다.
  const [touched, setTouched] = useState<Partial<Record<keyof FeeItemErrors, boolean>>>({});
  const selectedOption = FEE_ITEM_OPTIONS.find((option) => option.value === feeKind);
  const resolvedItemName = selectedOption?.label ?? itemName;
  const errors = getFeeItemErrors({
    itemCode: selectedOption?.value ?? null,
    itemName: resolvedItemName,
    defaultAmount
  });
  if (!feeKind) errors.itemCode = '항목 종류를 선택해주세요.';
  const title = `관리비 항목 ${item ? '수정' : '추가'}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    kindRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  /** 추천 이름은 선택지로 고정하고 직접 입력으로 전환하면 이전 이름·검증 표시를 비워 새로 작성하게 합니다. */
  function changeFeeKind(value: string) {
    if (value === feeKind) return;

    const option = FEE_ITEM_OPTIONS.find((entry) => entry.value === value);
    if (!option && value !== DIRECT_INPUT) return;

    setFeeKind(value);
    setItemName('');
    setTouched((previous) => ({
      ...previous,
      itemCode: false,
      itemName: false
    }));
  }

  /** 확인한 항목만 목록에 반영하고 0·음수 부호를 정규화해 같은 초안 ID와 순서를 유지합니다. */
  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      itemCode: true,
      itemName: true,
      defaultAmount: true
    });
    if (Object.keys(errors).length) return;
    onSave({
      clientId: item?.clientId ?? crypto.randomUUID(),
      itemCode: selectedOption?.value ?? null,
      itemName: resolvedItemName.trim(),
      defaultAmount: BigInt(defaultAmount).toString()
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'fee-editor-title'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'fee-editor-title'}
        >
          {title}
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={`${title} 닫기`}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        noValidate
        onSubmit={saveItem}
      >
        <div
          className={styles.fields}
        >
          <Dropdown
            ref={kindRef}
            label={'항목 종류'}
            required
            value={feeKind}
            options={FEE_KIND_OPTIONS}
            placeholder={'항목 종류를 선택해주세요'}
            description={selectedOption?.description ?? '목록에 없는 항목은 직접 입력을 선택해주세요.'}
            error={touched.itemCode ? errors.itemCode : undefined}
            onChange={changeFeeKind}
          />
          {feeKind === DIRECT_INPUT && (
            <Input
              label={'항목명'}
              required
              value={itemName}
              placeholder={'항목명을 입력해주세요'}
              error={touched.itemName ? errors.itemName : undefined}
              onBlur={() => setTouched((previous) => ({
                ...previous,
                itemName: true
              }))}
              onChange={(event) => setItemName(event.target.value)}
            />
          )}
          <AmountInput
            label={'기본 금액'}
            required
            value={defaultAmount}
            placeholder={'금액을 입력해주세요'}
            trailingContent={'원'}
            description={'0원과 음수도 입력할 수 있어요.'}
            error={touched.defaultAmount ? errors.defaultAmount : undefined}
            onBlur={() => setTouched((previous) => ({
              ...previous,
              defaultAmount: true
            }))}
            onChange={setDefaultAmount}
          />
          {item && (
            <Button
              variant={'outline'}
              className={styles['delete-button']}
              onClick={onDelete}
            >
              항목 삭제
            </Button>
          )}
        </div>
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            disabled={Object.keys(errors).length > 0}
          >
            {item ? '수정' : '추가'}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
