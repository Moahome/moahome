'use client';

import { useBalanceOperationsDialog } from './_hooks/useBalanceOperations';
import {
  AmountInput,
  Input,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './balanceOperationFields.module.css';

type Props = Pick<Extract<ReturnType<typeof useBalanceOperationsDialog>, {
  kind: 'ready';
}> & Parameters<typeof useBalanceOperationsDialog>[0], 'action' | 'data' | 'openingSelector' | 'cutoff' | 'amounts' | 'setAmounts' | 'editingOpening' | 'correctionReason' | 'setCorrectionReason' | 'busy' | 'missing' | 'setOpeningBuilding' | 'openingTargets' | 'inputOpening' | 'openingOptions' | 'selectedOpening' | 'enteredCount'>;

/** BalanceOperationsDialog 화면의 Section 표시 영역을 독립적으로 구성합니다. */
export function BalanceOperationFields({
  action,
  data,
  openingSelector,
  cutoff,
  amounts,
  setAmounts,
  editingOpening,
  correctionReason,
  setCorrectionReason,
  busy,
  missing,
  setOpeningBuilding,
  openingTargets,
  inputOpening,
  openingOptions,
  selectedOpening,
  enteredCount
}: Props) {
  return (<>
    {action.kind === 'opening' && (
      <fieldset
        className={styles['opening-workspace']}
        disabled={busy}
      >
        <div
          className={styles['opening-metrics']}
        >
          <div
            role={'group'}
            aria-label={'잔고 기준일'}
          >
            <span
              className={styles['opening-symbol']}
            >
              <ServiceIcon
                name={'closing'}
              />
            </span>
            <div>
              <span>
                잔고 기준일
              </span>
              <strong>
                {cutoff || '미설정'}
              </strong>
            </div>
          </div>
          <div
            role={'group'}
            aria-label={'정정 기한'}
            data-locked={data.initialCorrectionAllowed === false}
          >
            <span
              className={styles['opening-symbol']}
            >
              <ServiceIcon
                name={'clock'}
              />
            </span>
            <div>
              <span>
                정정 기한
              </span>
              <strong>
                {data.correctionDeadline ?? '확인 필요'}
              </strong>
            </div>
          </div>
        </div>
        {data.initialCorrectionAllowed === false && (
          <p
            className={styles['opening-locked']}
            role={'status'}
          >
            정정 기한이 지나 초기 기준이 잠겼습니다. 저장된 잔고는 계속 확인할 수 있습니다.
          </p>
        )}
        <section
          className={styles['opening-section']}
        >
          <div
            className={styles['opening-section-title']}
          >
            <span
              className={styles['opening-symbol']}
            >
              <ServiceIcon
                name={'bank'}
              />
            </span>
            <div>
              <h3>
                통장 선택
              </h3>
              <p>
                기준 잔고를 확인할 통장을 선택하세요.
              </p>
            </div>
          </div>
          {openingSelector}
          <div
            className={styles['opening-guide']}
          >
            <ServiceIcon
              name={'info'}
            />
            <div>
              <strong>
                선택한 통장의 동별 기준 잔고와 그날 마감 잔고를 입력합니다.
              </strong>
              <p>
                이후 월은 해당 통장의 입출금을 누적하고 이전 월은 확인된 입출금을 거꾸로 계산합니다.
              </p>
            </div>
          </div>
          {data.legacyOpening && missing.length > 0 && (
            <p
              className={styles['exclusion-note']}
            >
              통장 구분 전에 저장한 기준일과 잔고를 표시했습니다. 선택한 통장의 동별 금액이 맞는지 확인한 뒤 확정해주세요.
            </p>
          )}
        </section>
        {inputOpening && (
          <fieldset
            className={styles['initial-fields']}
            disabled={data.initialCorrectionAllowed === false}
          >
            <p>
              통장 초기 잔액 기준일:
              {' '}
              {cutoff || '통장 초기 잔액을 먼저 등록해주세요.'}
            </p>
            {data.cutoffDate && data.cutoffDate !== cutoff && (
              <p
                role={'alert'}
              >
                기존 동별 기준일은
                {' '}
                {data.cutoffDate}
                입니다. 통장 기준일
                {' '}
                {cutoff}
                의 동별 금액을 확인한 뒤 저장해주세요.
              </p>
            )}
          </fieldset>
        )}
        <section
          className={styles['opening-section']}
        >
          <div
            className={styles['opening-editor']}
          >
            <div
              className={styles['opening-building-field']}
            >
              <div
                className={styles['opening-section-title']}
              >
                <span
                  className={styles['opening-symbol']}
                >
                  <ServiceIcon
                    name={'building'}
                  />
                </span>
                <div>
                  <h3>
                    동 선택
                  </h3>
                  <p>
                    잔고를 입력할 동을 선택하세요.
                  </p>
                </div>
              </div>
              <SelectDropdown
                label={'동 선택'}
                placeholder={'동 이름으로 검색'}
                value={selectedOpening?.id ?? ''}
                onChange={setOpeningBuilding}
                options={openingOptions.map((row) => ({
                  value: row.id,
                  label: row.label,
                  searchKeywords: [row.label.replace('동', '')]
                }))}
              />
            </div>
            <div
              className={styles['opening-amount-field']}
            >
              <div
                className={styles['opening-section-title']}
              >
                <span
                  className={styles['opening-symbol']}
                >
                  <ServiceIcon
                    name={'coins'}
                  />
                </span>
                <div>
                  <h3>
                    {selectedOpening ? `${selectedOpening.label} 기준 잔고` : '기준 잔고'}
                  </h3>
                  <p>
                    선택한 동의 기준 잔고를 입력하세요.
                  </p>
                </div>
              </div>
              {selectedOpening && (
                <AmountInput
                  label={`${selectedOpening.label} ${missing.length ? '시작 잔고' : '기준 잔고'}`}
                  value={inputOpening ? (amounts[selectedOpening.id] ?? '') : (selectedOpening.openingBalance ?? '')}
                  readOnly={!inputOpening}
                  disabled={inputOpening && data.initialCorrectionAllowed === false}
                  trailingContent={(
                    <span
                      className={styles['opening-currency']}
                    >
                      원
                    </span>
                  )}
                  onChange={(value) => setAmounts((previous) => ({
                    ...previous,
                    [selectedOpening.id]: value
                  }))}
                />
              )}
            </div>
          </div>
          <p
            className={styles['opening-warning']}
          >
            <ServiceIcon
              name={'alert'}
            />
            세대별 미납·선납 금액을 입력하는 곳이 아닙니다. 부족한 동은 음수로 입력할 수 있습니다.
          </p>
        </section>
        {editingOpening && (
          <Input
            label={'정정 사유'}
            value={correctionReason}
            required
            maxLength={500}
            onChange={(event) => setCorrectionReason(event.target.value)}
          />
        )}
        {editingOpening && (
          <p
            className={styles.muted}
          >
            변경한 기준일의 마감 잔고를 확인해주세요. 변경 전 값과 사유는 정정 이력에 보관합니다.
          </p>
        )}
        <div
          className={styles['opening-progress']}
          role={'status'}
          hidden={!inputOpening}
        >
          <span>
            입력 완료
            {' '}
            <strong>
              {enteredCount}
              {' '}
              /
              {' '}
              {openingTargets.length}
              개 동
            </strong>
          </span>
          <span>
            동을 바꿔도 입력한 금액은 유지됩니다.
          </span>
        </div>
      </fieldset>
    )}
  </>);
}