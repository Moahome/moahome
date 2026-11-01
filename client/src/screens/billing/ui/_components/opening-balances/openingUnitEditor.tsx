'use client';

import { useState } from 'react';
import type { OpeningWorkspace } from '@/features/billing-management';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './openingBalances.module.css';

/** 행의 수정값은 적용 전까지 별도로 보관하며 취소 시 전체 인계 초안을 변경하지 않습니다. */
export function OpeningUnitEditor({ unit, onClose, onApply }: {
  unit: OpeningWorkspace['units'][number];
  onClose: () => void;
  onApply: (unit: OpeningWorkspace['units'][number]) => void;
}) {
  const [draft, setDraft] = useState(unit);
  const [error, setError] = useState('');

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'opening-unit-title'}
      onClose={onClose}
    >
      <header
        className={styles['section-heading']}
      >
        <h2
          id={'opening-unit-title'}
        >
          {unit.label}
          {' '}
          인계 정정
        </h2>
        <Button
          iconOnly
          variant={'ghost'}
          aria-label={'인계 정정 닫기'}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        className={styles.editor}
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^[0-9]{1,15}$/.test(draft.receivable) || !/^[0-9]{1,15}$/.test(draft.credit)) {
            setError('금액은 0원 이상의 정수로 입력해주세요.'); return;
          }
          onApply(draft);
        }}
      >
        <div
          className={styles['editor-amounts']}
        >
          <AmountInput
            label={'기존 미납'}
            aria-label={`${unit.label} 기존 미납`}
            value={draft.receivable}
            onChange={(value) => setDraft({
              ...draft,
              receivable: value
            })}
          />
          <AmountInput
            label={'기존 선납'}
            aria-label={`${unit.label} 기존 선납`}
            value={draft.credit}
            onChange={(value) => setDraft({
              ...draft,
              credit: value
            })}
          />
        </div>
        <CalendarPicker
          label={'발생월 (선택)'}
          mode={'month'}
          value={draft.originMonth ?? ''}
          onChange={(value) => setDraft({
            ...draft,
            originMonth: value || null
          })}
        />
        <Input
          label={'부담 주체 메모 (선택)'}
          value={draft.responsibility ?? ''}
          maxLength={500}
          onChange={(event) => setDraft({
            ...draft,
            responsibility: event.target.value || null
          })}
        />
        <p>
          적용한 내용은 임시 저장한 뒤 인계 확정해주세요. 미납·선납은 각각 입력할 수 있습니다.
        </p>
        {error && (
          <p
            role={'alert'}
            className={styles.error}
          >
            {error}
          </p>
        )}
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
          >
            적용
          </Button>
        </footer>
      </form>
    </ClientModal>
  );
}
