'use client';

import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  calculateExpenseAllocation,
  sortExpenseLabels
} from '../../model/allocation';
import type { ExpenseDraft } from '../../model/allocationTypes';
import styles from './allocationEditor.module.css';

/** 부담 동과 외부 부담처를 명시적으로 정하고 합계·원 미만 잔여액을 확인하게 합니다. */
export function AllocationEditor({ total, draft, buildings, onChange, disabled = false, purpose = 'expense', showDetails = true, compact = false, showRule = true, sectioned = false }: {
  total: string; draft: ExpenseDraft; buildings: { id: string; label: string }[]; onChange: (draft: ExpenseDraft) => void; disabled?: boolean; purpose?: 'expense' | 'income'; showDetails?: boolean; compact?: boolean; showRule?: boolean; sectioned?: boolean;
}) {
  const income = purpose === 'income';
  const result = calculateExpenseAllocation(total, draft, purpose);
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
      aria-label={income ? '입금 배분 설정' : '지출 설정'}
      data-mode={draft.mode}
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
          {income ? '입금액을 선택한 동에 배분합니다. 한 동에 전액 지정할 수도 있습니다. 원 미만 금액은 금액 직접 입력으로 조정해주세요.' : '전기료처럼 두 동이 각각 1/4을 부담하면 25%씩 입력하고, 나머지 50%의 부담처도 지정해주세요.'}
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
            key={share.buildingId ?? `external-${index}`}
          >
            {share.buildingId ? (
              <strong>
                {share.label}
              </strong>
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
                className={sectioned ? styles['share-value'] : undefined}
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
              <Input
                aria-label={`${share.label || '외부 부담처'} ${income ? '배분액' : '부담액'}`}
                className={sectioned ? styles['share-value'] : undefined}
                inputMode={'numeric'}
                value={share.amount}
                onChange={(event) => changeShare(index, {
                  amount: event.target.value.replace(/[^0-9]/g, '')
                })}
              />
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
          data-valid={!result.error}
          data-overallocated={result.remaining < BigInt(0)}
        >
          <span>
            {`${income ? '배분액' : '부담액'} 합계 ${formatWon(result.allocated.toString())}`}
          </span>
          <span>
            {result.remaining < BigInt(0)
              ? `초과 금액 ${formatWon((-result.remaining).toString())}`
              : `남은 금액 ${formatWon(result.remaining.toString())}`}
          </span>
        </div>
        {result.error && (!sectioned || draft.category.trim()) && (
          <p
            role={'status'}
            className={styles.warning}
          >
            {result.error}
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
