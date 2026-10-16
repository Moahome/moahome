'use client';

import {
  useState,
  type FormEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import { Toast } from '@/shared/ui/toast';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  AmountInput,
  SelectDropdown,
  Input
} from '@/shared/ui/form-controls';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import {
  getPreviewSelectableUnits,
  getPreviewUnitSearchOptions
} from '../../../model/paymentPreview';
import styles from './manualPayment.module.css';

/** 수동 입력은 현재 명단의 세대로 초안을 만들고 상세에서 전액 누적 수납을 확정합니다. */
export function ManualPayment({ unitId = '', onClose, onCreated }: {
  unitId?: string; onClose: () => void; onCreated: (id: string, date: string) => void;
}) {
  const { ledger, update, busy } = usePaymentWorkspace();
  const [unit, setUnit] = useState(unitId);
  const [date, setDate] = useState(ledger.asOf);
  const [requestId] = useState(() => crypto.randomUUID());
  const selectableUnits = getPreviewSelectableUnits(ledger);
  const selectedUnit = selectableUnits.find((item) => item.id === unit);
  const payer = selectedUnit?.representativeName ?? '';
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState<{ message: string; id: number } | null>(null);

  /** 대표 주민은 서버에서 다시 조회하고 요청 ID를 재사용해 응답 유실 재시도도 중복 수납으로 만들지 않습니다. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedUnit || !payer) { setError('세대와 대표 주민을 확인해주세요.'); return; }
    const failure = await update({
      type: 'manual',
      data: {
        id: requestId,
        unitId: unit,
        date,
        amount
      }
    }, '수동 입금 초안을 등록했어요.');
    if (failure) { setRequestError((current) => ({
      message: failure,
      id: (current?.id ?? 0) + 1
    })); return; }
    onCreated(requestId, date);
  }

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'manual-payment-title'}
    >
      <form
        onSubmit={submit}
        noValidate
      >
        <div
          className={styles.heading}
        >
          <div>
            <h2
              id={'manual-payment-title'}
            >
              수동 입금 등록
            </h2>
            <p>
              은행 앱에서 확인한 입금 정보를 입력해주세요.
            </p>
          </div>
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'수동 입금 등록 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        </div>
        <p
          className={styles.notice}
        >
          선택한 세대의 현재 대표 주민을 입금자로 등록합니다. 상세에서 입금 전액을 누적 수납으로 확정합니다.
        </p>
        <SelectDropdown
          label={'세대'}
          value={selectedUnit?.id ?? ''}
          onChange={setUnit}
          required
          placeholder={'이름 또는 동·호수로 검색'}
          disabled={busy}
          options={getPreviewUnitSearchOptions(ledger)}
        />
        <CalendarPicker
          label={'입금일'}
          value={date}
          onChange={setDate}
          required
        />
        <Input
          label={'입금자명'}
          value={payer}
          readOnly
          description={payer ? '현재 대표 주민 이름입니다.' : '세대를 선택하고 대표 주민 등록 여부를 확인해주세요.'}
          maxLength={100}
          required
        />
        <AmountInput
          label={'입금액'}
          value={amount}
          onChange={setAmount}
          trailingContent={'원'}
          required
        />
        {error && (
          <p
            role={'alert'}
            className={styles.error}
          >
            {error}
          </p>
        )}
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            loading={busy}
            disabled={!selectedUnit || !payer || !amount}
          >
            수납 확인하기
          </Button>
        </div>
      </form>
      {requestError && (
        <Toast
          key={requestError.id}
          message={requestError.message}
          tone={'error'}
          onClose={() => setRequestError(null)}
        />
      )}
    </ClientModal>
  );
}
