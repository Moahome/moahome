'use client';

import { useState } from 'react';
import {
  FEE_ITEM_OPTIONS,
  type BillingItem
} from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { sumBillingItems } from '../../../model/billing';
import styles from './billingSettingsForm.module.css';

const ITEM_OPTIONS = [...FEE_ITEM_OPTIONS, {
  value: 'DIRECT',
  label: '기타'
}];

/** 전체·동별 편집에 동일한 종류·직접 입력·금액 규칙을 적용합니다. */
export function BillingItemEditor({ items, onChange, onAdd, title }: {
  items: BillingItem[];
  onChange: (items: BillingItem[]) => void;
  onAdd: () => void;
  title?: string;
}) {
  const total = items.every((item) => /^-?[0-9]+$/.test(item.amount)) ? sumBillingItems(items) : null;

  return (
    <div
      className={styles.editor}
    >
      {title && (
        <h3
          className={styles['editor-title']}
        >
          {title}
        </h3>
      )}
      <Button
        className={styles['editor-add']}
        variant={'outline'}
        size={'sm'}
        onClick={onAdd}
        leadingIcon={(
          <ServiceIcon
            name={'plus'}
          />
        )}
      >
        항목 추가
      </Button>
      <div
        className={styles['item-list']}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            className={styles['item-row']}
            role={'group'}
            aria-label={`항목 ${index + 1}`}
          >
            <span
              className={styles.order}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <h4
              className={styles['item-title']}
            >
              {`항목 ${index + 1}`}
            </h4>
            <BillingItemFields
              item={item}
              labelPrefix={`항목 ${index + 1}`}
              onChange={(updated) => onChange(items.map((current) => current.id === item.id ? updated : current))}
            />
            <AmountInput
              fieldClassName={styles['item-amount']}
              label={`항목 ${index + 1} 기본 금액`}
              value={item.amount}
              required
              maxLength={24}
              trailingContent={'원'}
              onChange={(amount) => onChange(items.map((current) => current.id === item.id ? {
                ...current,
                amount
              } : current))}
            />
            <Button
              className={styles['item-delete']}
              variant={'ghost'}
              size={'sm'}
              iconOnly
              aria-label={`항목 ${index + 1} 삭제`}
              onClick={() => onChange(items.filter((current) => current.id !== item.id))}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </div>
        ))}
        {!items.length && (
          <p
            className={styles.empty}
          >
            기본 관리비 항목을 추가해주세요.
          </p>
        )}
      </div>
      <div
        className={styles['item-footer']}
      >
        <div
          className={styles['draft-total']}
        >
          <span>
            세대당 합계
          </span>
          <strong>
            {total === null ? '금액 입력 중' : formatWon(total)}
          </strong>
        </div>
      </div>
    </div>
  );
}


/** 기본·임시 모두 추천 종류를 선택하며 기타를 명시적으로 선택했을 때만 항목명을 입력합니다. */
export function BillingItemFields({ item, labelPrefix, onChange }: {
  item: BillingItem;
  labelPrefix: string;
  onChange: (item: BillingItem) => void;
}) {
  const [direct, setDirect] = useState(item.code === null && Boolean(item.name));
  const kind = item.code ?? (direct ? 'DIRECT' : '');

  return (
    <div
      className={styles['item-kind']}
    >
      <Dropdown
        label={`${labelPrefix} 종류`}
        options={ITEM_OPTIONS}
        value={kind}
        placeholder={'항목 선택'}
        required
        onChange={(value) => {
          const option = FEE_ITEM_OPTIONS.find((option) => option.value === value);
          setDirect(value === 'DIRECT');
          onChange({
            ...item,
            code: option?.value ?? null,
            name: option?.label ?? ''
          });
        }}
      />
      {direct && item.code === null && (
        <Input
          label={`${labelPrefix} 이름`}
          value={item.name}
          maxLength={100}
          required
          placeholder={'기타 항목명'}
          onChange={(event) => onChange({
            ...item,
            name: event.target.value
          })}
        />
      )}
    </div>
  );
}
