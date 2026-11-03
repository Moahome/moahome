'use client';

import {
  useState,
  type FormEvent
} from 'react';
import { AllocationEditor } from '../allocation-editor/allocationEditor';
import { calculateExpenseAllocation } from '../../model/allocation';
import type { ExpenseDraft } from '../../model/allocationTypes';
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
import type {
  ManualReceiptValues,
  ManualReceiptUnit
} from '../../model/manualReceiptTypes';
import styles from './manualReceiptForm.module.css';

/** 입금 용도에 필요한 입력만 표시하고 세대 수납·기타 입금·동별 배분을 같은 수동 등록으로 처리합니다. */
export function ManualReceiptForm({ accounts, units, buildings, asOf, unitId = '', presentation = 'modal', title = '수동 입금 등록', allowPayerInput = false, busy = false, initialValue, onCancel, onClose, onSubmit }: {
  initialValue?: ManualReceiptValues;
  onCancel?: () => void;
  title?: string;
  accounts: { id: string; label: string; isPrimary?: boolean }[];
  units: ManualReceiptUnit[];
  buildings: { id: string; label: string }[];
  asOf: string;
  presentation?: 'modal' | 'page';
  allowPayerInput?: boolean;
  busy?: boolean;
  unitId?: string;
  onClose: () => void;
  onSubmit: (values: ManualReceiptValues) => Promise<string | null>;
}) {
  const activeAccounts = accounts;
  const [accountId, setAccountId] = useState(() => initialValue?.accountId ?? activeAccounts.find((account) => account.isPrimary)?.id ?? activeAccounts[0]?.id ?? '');
  const [purpose, setPurpose] = useState<'' | 'HOUSEHOLD' | 'OTHER' | 'SHARED'>(initialValue?.purpose ?? (unitId ? 'HOUSEHOLD' : ''));
  const [enteredPayer, setEnteredPayer] = useState(initialValue?.payer ?? '');
  const [allocation, setAllocation] = useState<ExpenseDraft>(() => initialValue?.incomeAllocation ?? ({
    category: initialValue?.category ?? '',
    note: initialValue?.note ?? '',
    mode: 'EQUAL',
    saveAsRule: false,
    allocations: buildings.map((building) => ({
      buildingId: building.id,
      label: building.label,
      amount: '',
      percentage: ''
    }))
  }));
  const household = purpose === 'HOUSEHOLD';
  const other = purpose === 'OTHER' || purpose === 'SHARED';
  const [unit, setUnit] = useState(initialValue?.unitId ?? unitId);
  const [date, setDate] = useState(initialValue?.date ?? asOf);
  const selectableUnits = units;
  const selectedUnit = selectableUnits.find((item) => item.id === unit);
  const payer = household && !allowPayerInput ? selectedUnit?.representativeName ?? '' : enteredPayer;
  const [amount, setAmount] = useState(initialValue?.amount ?? '');
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState<{ message: string; id: number } | null>(null);

  const split = calculateExpenseAllocation(amount || '0', allocation, 'income');
  const notices = {
    '': '입금 용도를 먼저 선택해주세요. 용도에 맞는 항목만 입력합니다.',
    HOUSEHOLD: allowPayerInput ? '입금된 세대와 실제 입금자명을 입력해주세요.' : '선택한 세대의 현재 대표 주민을 입금자로 등록합니다. 상세에서 입금 전액을 누적 수납으로 확정합니다.',
    OTHER: '외부 분담금·수리비 등 세대 관리비와 별개인 입금입니다. 세대를 지정하지 않고 입금 항목으로 등록합니다.',
    SHARED: '입금액을 한 동에 전액 지정하거나 여러 동에 나눠 등록합니다. 예: 2동 100만 원, 3동 50만 원.'
  };

  /** 서버에서 용도·명단·배분 합계를 다시 검증하며 실패한 요청의 ID와 입력을 유지합니다. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!purpose) { setError('입금 용도를 선택해주세요.'); return; }
    if (!activeAccounts.some((account) => account.id === accountId)) { setError('입금된 통장을 선택해주세요.'); return; }
    if (household && (!selectedUnit || !payer)) { setError('세대와 대표 주민을 확인해주세요.'); return; }
    if (!payer.trim()) { setError('입금자명을 입력해주세요.'); return; }
    if (!/^[0-9]{1,15}$/.test(amount) || BigInt(amount) <= BigInt(0)) { setError('0원보다 큰 입금액을 입력해주세요.'); return; }
    if (other && !allocation.category.trim()) { setError('입금 항목을 입력해주세요.'); return; }
    if (purpose === 'SHARED' && split.error) { setError(split.error); return; }
    if (!date || date > asOf) { setError('오늘 또는 이전 입금일을 선택해주세요.'); return; }
    const failure = await onSubmit({
      purpose,
      unitId: household ? unit : undefined,
      payer: payer.trim(),
      category: other ? allocation.category.trim() : undefined,
      note: other ? allocation.note.trim() || undefined : undefined,
      incomeAllocation: purpose === 'SHARED' ? {
        ...allocation,
        allocations: split.allocations
      } : undefined,
      accountId,
      date,
      amount
    });
    if (failure) { setRequestError((current) => ({
      message: failure,
      id: (current?.id ?? 0) + 1
    })); return; }
  }

  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <form
        onSubmit={submit}
        noValidate
      >
        <div
          className={styles.heading}
        >
          <div>
            <Title
              id={'manual-payment-title'}
            >
              {title}
            </Title>
            <p>
              은행 앱에서 확인한 입금 정보를 입력해주세요.
            </p>
          </div>
          {presentation === 'modal' && (
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={`${title} 닫기`}
              disabled={busy}
              onClick={onClose}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          )}
        </div>
        <div
          className={styles.body}
        >
          <p
            className={styles.notice}
          >
            {notices[purpose]}
          </p>
          <SelectDropdown
            label={'입금 용도'}
            placeholder={'입금 용도를 선택해주세요'}
            value={purpose}
            onChange={(value) => { setPurpose(value as typeof purpose); setError(''); }}
            disabled={busy}
            required
            options={[
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
          <SelectDropdown
            label={'입금 통장'}
            value={accountId}
            onChange={setAccountId}
            disabled={busy}
            required
            options={activeAccounts.map((account) => ({
              value: account.id,
              label: account.label
            }))}
          />
          {household && (
            <SelectDropdown
              label={'세대'}
              value={selectedUnit?.id ?? ''}
              onChange={setUnit}
              required
              placeholder={'이름 또는 동·호수로 검색'}
              disabled={busy}
              options={units.map((entry) => ({
                value: entry.id,
                label: entry.label,
                searchKeywords: [...(entry.residentNames ?? []), entry.representativeName ?? '']
              }))}
            />
          )}
          <CalendarPicker
            label={'입금일'}
            maxDate={asOf}
            value={date}
            onChange={setDate}
            required
          />
          {purpose && (
            <Input
              label={'입금자명'}
              value={payer}
              readOnly={household && !allowPayerInput}
              disabled={busy}
              onChange={(event) => setEnteredPayer(event.target.value)}
              placeholder={household ? undefined : '은행에 표시된 입금자명'}
              description={household && !allowPayerInput ? (payer ? '현재 대표 주민 이름입니다.' : '세대를 선택하고 대표 주민 등록 여부를 확인해주세요.') : undefined}
              maxLength={100}
              required
            />
          )}
          <AmountInput
            label={'입금액'}
            value={amount}
            onChange={setAmount}
            trailingContent={'원'}
            disabled={busy}
            required
          />
          {other && (
            <Input
              label={'입금 항목'}
              value={allocation.category}
              onChange={(event) => setAllocation({
                ...allocation,
                category: event.target.value
              })}
              placeholder={'예: 외부 분담금, 수리비, 예금이자'}
              maxLength={100}
              disabled={busy}
              required
            />
          )}
          {purpose === 'SHARED' && buildings.length > 0 && (
            <section
              className={styles.allocation}
              aria-label={'동별 입금 배분'}
            >
              <h3>
                동별 배분
              </h3>
              <AllocationEditor
                total={amount || '0'}
                draft={allocation}
                buildings={buildings}
                onChange={setAllocation}
                purpose={'income'}
                showDetails={false}
                compact
                disabled={busy}
              />
            </section>
          )}
          {other && (
            <Input
              label={'메모'}
              value={allocation.note}
              onChange={(event) => setAllocation({
                ...allocation,
                note: event.target.value
              })}
              maxLength={500}
              disabled={busy}
            />
          )}
          {error && (
            <p
              role={'alert'}
              className={styles.error}
            >
              {error}
            </p>
          )}
        </div>
        <div
          className={styles.actions}
        >
          {(presentation === 'modal' || onCancel) && (
            <Button
              variant={'outline'}
              tone={'neutral'}
              disabled={busy}
              onClick={onCancel ?? onClose}
            >
              취소
            </Button>
          )}
          <Button
            type={'submit'}
            tone={initialValue ? 'success' : undefined}
            loading={busy}
            disabled={!purpose || !accountId || !payer.trim() || !amount || (household && !selectedUnit) || (other && !allocation.category.trim()) || (purpose === 'SHARED' && Boolean(split.error))}
          >
            {initialValue ? '수정' : '등록'}
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
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'manual-payment-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'manual-payment-title'}
    >
      {content}
    </ClientModal>
  );
}
