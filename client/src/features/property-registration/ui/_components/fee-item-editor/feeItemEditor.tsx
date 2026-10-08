'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import {
  getFeeItemErrors,
  type FeeItemDraft
} from '../../../model/feeItems';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import styles from './feeItemEditor.module.css';

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
  const nameRef = useRef<HTMLInputElement>(null);
  const [itemName, setItemName] = useState(item?.itemName ?? '');
  const [defaultAmount, setDefaultAmount] = useState(item?.defaultAmount ?? '');
  const [touched, setTouched] = useState(false);
  const errors = getFeeItemErrors({
    itemName,
    defaultAmount
  });
  const title = `관리비 항목 ${item ? '수정' : '추가'}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    nameRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  /** 맨 앞의 음수 부호와 ASCII 숫자만 받고 소수·문자를 제거해 다른 금액으로 바꾸지 않습니다. */
  function changeAmount(event: ChangeEvent<HTMLInputElement>) {
    if (/^-?[0-9]*$/.test(event.target.value)) setDefaultAmount(event.target.value);
  }

  /** 확인한 항목만 목록에 반영하고 0·음수 부호를 정규화해 같은 초안 ID와 순서를 유지합니다. */
  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSave({
      clientId: item?.clientId ?? crypto.randomUUID(),
      itemName: itemName.trim(),
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
            <RegistrationIcon
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
          <Input
            ref={nameRef}
            label={'항목명'}
            required
            value={itemName}
            placeholder={'예) 일반관리비'}
            error={touched ? errors.itemName : undefined}
            onBlur={() => setTouched(true)}
            onChange={(event) => setItemName(event.target.value)}
          />
          <Input
            label={'기본 금액'}
            required
            value={defaultAmount}
            placeholder={'금액을 입력해주세요'}
            inputMode={'text'}
            pattern={'-?[0-9]+'}
            trailingContent={'원'}
            description={'0원과 음수도 입력할 수 있어요.'}
            error={touched ? errors.defaultAmount : undefined}
            onBlur={() => setTouched(true)}
            onChange={changeAmount}
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
