'use client';

import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  calculateExpenseAllocation,
  fillAllocationRemainder,
  sortExpenseLabels
} from '../../model/allocation';
import { ExpenseAccountSelect } from '../expense-account-select/expenseAccountSelect';
import type {
  ExpenseAccountOption,
  ExpenseDraft
} from '../../model/allocationTypes';
import styles from './allocationEditor.module.css';

/** 부담 동과 외부 부담처를 명시적으로 정하고 합계·원 미만 잔여액을 확인하게 합니다. */
export function AllocationEditor({ total, draft, buildings, expenseAccounts, onChange, disabled = false, purpose = 'expense', showDetails = true, compact = false, showRule = true, sectioned = false, limits, validationError }: {
  limits?: Readonly<Record<string, string | null>>;
  validationError?: string;
  expenseAccounts?: readonly ExpenseAccountOption[];
  total: string; draft: ExpenseDraft; buildings: { id: string; label: string }[]; onChange: (draft: ExpenseDraft) => void; disabled?: boolean; purpose?: 'expense' | 'income' | 'transfer'; showDetails?: boolean; compact?: boolean; showRule?: boolean; sectioned?: boolean;
}) {
  const income = purpose !== 'expense';
  const transfer = purpose === 'transfer';
  const result = calculateExpenseAllocation(total, draft, income ? 'income' : 'expense');
  const allocationError = validationError || result.allocationError;
  function changeMode(mode: ExpenseDraft['mode']) {
    onChange({
      ...draft,
      mode,
      allocations: mode === 'AMOUNT' ? result.allocations : draft.allocations
    });
  }
  function changeShare(index: number, patch: Partial<ExpenseDraft['allocations'][number]>) {
    onChange({
      ...draft,
      allocations: draft.allocations.map((a, i) => i === index ? {
        ...a,
        ...patch
      } : a)
    });
  }
  return (
    <fieldset
      className={styles.editor}
      aria-label={transfer ? '이체 배분 설정' : income ? '입금 배분 설정' : '지출 설정'}
      data-mode={draft.mode}
      data-transfer={transfer}
      data-compact={compact}
      data-sectioned={sectioned}
      disabled={disabled}
    >
      <div
        className={styles.settings}
      >
        {sectioned && (
          <h3
            className={styles['section-title']}
          >
            <span>
              2
            </span>
            배분 설정
          </h3>
        )}
        <div
          className={styles.fields}
          data-details={showDetails}
        >
          {showDetails && (
            <Input
              label={income ? '입금 항목' : '지출명'}
              value={draft.category}
              maxLength={100}
              onChange={(event) => onChange({
                ...draft,
                category: event.target.value
              })}
              placeholder={'거래 내용으로 자동 입력됩니다'}
              description={!draft.category.trim() ? `${income ? '입금 항목' : '지출명'}을 입력해주세요.` : undefined}
            />
          )}
          <Dropdown
            label={'나누는 방법'}
            value={draft.mode}
            onChange={(value) => changeMode(value as ExpenseDraft['mode'])}
            options={[
              {
                value: 'EQUAL',
                label: '선택한 곳에 똑같이 나누기'
              }, {
                value: 'RATIO',
                label: '비율 지정'
              }, {
                value: 'AMOUNT',
                label: '금액 직접 입력'
              }
            ]}
            disabled={disabled}
          />
        </div>
        {!income && showDetails && (
          <ExpenseAccountSelect
            value={draft.accountCode}
            options={expenseAccounts}
            disabled={disabled}
            onChange={(accountCode) => onChange({
              ...draft,
              accountCode
            })}
          />
        )}
        <div
          className={styles.targets}
          role={'group'}
          aria-label={income ? '배분 동' : '부담 동'}
        >
          {sortExpenseLabels(buildings).map((building) => (
            <label
              key={building.id}
            >
              <input
                type={'checkbox'}
                checked={draft.allocations.some((a) => a.buildingId === building.id)}
                onChange={(event) => onChange({
                  ...draft,
                  allocations: event.target.checked
                    ? sortExpenseLabels([...draft.allocations, {
                      buildingId: building.id,
                      label: building.label,
                      amount: '',
                      percentage: ''
                    }])
                    : draft.allocations.filter((a) => a.buildingId !== building.id)
                })}
              />
              {building.label}
            </label>
          ))}
          {!income && (
            <Button
              variant={'outline'}
              size={sectioned ? 'md' : 'sm'}
              className={sectioned ? styles['target-add'] : undefined}
              leadingIcon={sectioned ? (
                <ServiceIcon
                  name={'plus'}
                />
              ) : undefined}
              disabled={disabled}
              onClick={() => onChange({
                ...draft,
                allocations: [...draft.allocations, {
                  buildingId: null,
                  label: '',
                  amount: '',
                  percentage: ''
                }]
              })}
            >
              외부·공통 부담처 추가
            </Button>
          )}
        </div>
        <p
          className={styles.help}
        >
          {transfer ? '선택한 동에 이체금액을 나눕니다.' : income ? '선택한 동에 입금액을 나눕니다.' : '선택한 곳에 출금액을 나눕니다. 외부 부담액도 지정해주세요.'}
        </p>
      </div>
      <div
        className={styles.amounts}
      >
        {sectioned && (
          <h3
            className={styles['section-title']}
          >
            <span>
              3
            </span>
            배분 금액
          </h3>
        )}
        {draft.allocations.map((share, index) => (
          <div
            className={styles.share}
            data-external={!share.buildingId}
            key={share.buildingId ?? `external-${index}`}
          >
            {share.buildingId ? (
              <div>
                <strong>
                  {share.label}
                </strong>
                {limits !== undefined && (
                  <p
                    className={styles['available-amount']}
                  >
                    {limits[share.buildingId] == null ? '보유금 확인 필요' : (
                      <>
                        {'이체 가능 '}
                        <strong>
                          {formatWon((BigInt(limits[share.buildingId]!) > BigInt(0) ? BigInt(limits[share.buildingId]!) : BigInt(0)).toString())}
                        </strong>
                      </>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <Input
                aria-label={`외부 부담처 ${index + 1}`}
                placeholder={'예: 외부 101동'}
                value={share.label}
                maxLength={100}
                onChange={(event) => changeShare(index, {
                  label: event.target.value
                })}
              />
            )}
            {draft.mode === 'RATIO' && (
              <Input
                aria-label={`${share.label || '외부 부담처'} ${income ? '배분 비율' : '부담 비율'}`}
                className={styles['share-value']}
                inputMode={'decimal'}
                placeholder={'25'}
                value={share.percentage ?? ''}
                onChange={(event) => changeShare(index, {
                  percentage: event.target.value
                })}
              />
            )}
            {draft.mode === 'RATIO' && (
              <span>
                %
              </span>
            )}
            {draft.mode === 'AMOUNT' ? (
              <div
                className={styles['amount-controls']}
              >
                {transfer ? (
                  <AmountInput
                    aria-label={`${share.label} 배분액`}
                    className={styles['share-value']}
                    maxLength={19}
                    value={share.amount}
                    onChange={(value) => changeShare(index, {
                      amount: value.replace(/[^0-9]/g, '').slice(0, 15)
                    })}
                  />
                ) : (
                  <Input
                    aria-label={`${share.label || '외부 부담처'} ${income ? '배분액' : '부담액'}`}
                    className={styles['share-value']}
                    inputMode={'numeric'}
                    maxLength={15}
                    value={share.amount}
                    onChange={(event) => changeShare(index, {
                      amount: event.target.value.replace(/[^0-9]/g, '')
                    })}
                  />
                )}
                <Button
                  variant={'outline'}
                  className={styles['fill-remainder']}
                  aria-label={`${share.label || '외부 부담처'} 잔액 채우기`}
                  disabled={disabled || result.remaining <= BigInt(0) || draft.allocations.some((part) => !/^[0-9]{0,15}$/.test(part.amount))
                    || (limits !== undefined && (limits[share.buildingId ?? ''] == null || BigInt(limits[share.buildingId ?? '']!) <= BigInt(share.amount || '0')))}
                  onClick={() => onChange(fillAllocationRemainder(total, draft, index, limits === undefined ? undefined : limits[share.buildingId ?? ''] ?? null))}
                >
                  잔액 채우기
                </Button>
              </div>
            ) : (
              <strong>
                {formatWon(result.allocations[index].amount)}
              </strong>
            )}
            {!share.buildingId && (
              <Button
                variant={'ghost'}
                size={'sm'}
                iconOnly
                aria-label={`${share.label || '외부 부담처'} 제거`}
                leadingIcon={(
                  <ServiceIcon
                    name={'close'}
                  />
                )}
                disabled={disabled}
                onClick={() => onChange({
                  ...draft,
                  allocations: draft.allocations.filter((_, i) => i !== index)
                })}
              />
            )}
          </div>
        ))}
        <div
          className={styles.total}
        >
          <span>
            {`${income ? '배분액' : '부담액'} 합계 `}
            <strong>
              {formatWon(result.allocated.toString())}
            </strong>
          </span>
          <span
            data-overallocated={result.remaining < BigInt(0)}
          >
            {result.remaining < BigInt(0)
              ? `초과 금액 ${formatWon((-result.remaining).toString())}`
              : <>
                {'남은 금액 '}
                <strong>
                  {formatWon(result.remaining.toString())}
                </strong>
              </>}
          </span>
        </div>
        {!allocationError && BigInt(total) > BigInt(0) && (
          <p
            className={styles.complete}
            role={'status'}
          >
            <ServiceIcon
              name={'check'}
            />
            배분 완료
          </p>
        )}
        {allocationError && (
          <p
            role={'status'}
            className={styles.warning}
          >
            {transfer ? allocationError.replaceAll('입금', '이체') : allocationError}
          </p>
        )}
      </div>
      {showDetails && (
        <Input
          label={'메모'}
          value={draft.note ?? ''}
          maxLength={500}
          onChange={(event) => onChange({
            ...draft,
            note: event.target.value
          })}
        />
      )}
      {!income && showRule && (
        <label
          className={styles.remember}
        >
          <input
            type={'checkbox'}
            checked={draft.saveAsRule}
            onChange={(event) => onChange({
              ...draft,
              saveAsRule: event.target.checked
            })}
          />
          같은 내용의 거래에 이 설정 사용
        </label>
      )}
    </fieldset>
  );
}
