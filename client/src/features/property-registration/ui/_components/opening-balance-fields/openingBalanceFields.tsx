'use client';

import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Radio,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { useState } from 'react';
import { getOpeningToday } from '../../../model/openingBalances';
import type { OpeningBalancesDraft } from '../../../model/openingBalancesTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import { getSortedBuildings } from '../../_utils/setupSorting';
import styles from './openingBalanceFields.module.css';

/** 기존 입력 페이지 안에서 인계 금액과 기준일을 확인하며 최종 제출 전에는 서버에 저장하지 않습니다. */
export function OpeningBalanceFields({ kind, opening, units, buildings, onChange, hideAccountAmount = false, showErrors = false }: {
  showErrors?: boolean;
  hideAccountAmount?: boolean;
  kind: 'units' | 'account' | 'fees';
  opening: OpeningBalancesDraft;
  units: UnitDraft[];
  buildings: BuildingDraft[];
  onChange: (opening: OpeningBalancesDraft) => void;
}) {
  const [selected, setSelected] = useState('');
  const ordered = getSortedBuildings(buildings);
  const building = ordered.find((row) => row.clientId === selected) ?? ordered[0];
  const entered = buildings.filter((row) => /^-?[0-9]{1,15}$/.test(opening.buildings[row.clientId] ?? ''));
  const total = entered.reduce((sum, row) => sum + BigInt(opening.buildings[row.clientId]), BigInt(0));

  /** 미입력은 자동으로 0원이 되지 않으며 관리자가 확인한 경우에만 빈 칸을 채웁니다. */
  function confirmZeroAmounts() {
    onChange({
      ...opening,
      units: Object.fromEntries(units.map((unit) => {
        const value = opening.units[unit.clientId];
        return [unit.clientId, {
          receivable: value?.receivable || '0',
          credit: value?.credit || '0'
        }];
      }))
    });
  }
  if (kind === 'units') return (
    <section
      className={styles.panel}
      aria-label={'기존 미납·선납 설정'}
    >
      <h3>
        기존 미납·선납
      </h3>
      <p>
        아래 세대 목록에 기존 장부의 남은 금액을 입력하세요. 통장 잔액과는 별도로 관리합니다.
      </p>
      <CalendarPicker
        label={'기존 장부 기준일'}
        variant={'input'}
        maxDate={getOpeningToday}
        error={showErrors && (!opening.cutoffDate || opening.cutoffDate > getOpeningToday()) ? '기존 장부 기준일을 오늘 또는 이전 날짜로 선택해주세요.' : undefined}
        value={opening.cutoffDate}
        onChange={(cutoffDate) => onChange({
          ...opening,
          cutoffDate
        })}
        required
      />
      <fieldset
        className={styles.choices}
        aria-describedby={showErrors && !opening.unitMode ? 'opening-unit-mode-error' : undefined}
      >
        <legend>
          기존 미납·선납 여부
          <span
            className={styles.required}
            aria-hidden={'true'}
          >
            {' '}
            *
          </span>
        </legend>
        <Radio
          name={'opening-unit-mode'}
          aria-invalid={showErrors && !opening.unitMode || undefined}
          label={'기존 미납·선납 없음'}
          checked={opening.unitMode === 'NONE'}
          onChange={() => onChange({
            ...opening,
            unitMode: 'NONE'
          })}
        />
        <Radio
          name={'opening-unit-mode'}
          aria-invalid={showErrors && !opening.unitMode || undefined}
          label={'세대별 금액 입력'}
          checked={opening.unitMode === 'ENTER'}
          onChange={() => onChange({
            ...opening,
            unitMode: 'ENTER'
          })}
        />
      </fieldset>
      {showErrors && !opening.unitMode && (
        <p
          id={'opening-unit-mode-error'}
          className={styles.error}
        >
          기존 미납·선납 없음 또는 세대별 금액 입력을 선택해주세요.
        </p>
      )}
      {opening.unitMode === 'ENTER' && (
        <Button
          variant={'outline'}
          onClick={confirmZeroAmounts}
          disabled={!units.length}
        >
          빈 금액 0원으로 확인
        </Button>
      )}
      {opening.unitMode === 'NONE' && (
        <p>
          모든 세대의 기존 미납·선납을 0원으로 인계합니다.
        </p>
      )}
    </section>
  );
  if (kind === 'fees') return (
    <section
      className={styles.panel}
      aria-label={'관리 시작 기준'}
    >
      <h3>
        관리 시작 기준
      </h3>
      <p>
        {'기존 장부 기준일: '}
        <strong>
          {opening.cutoffDate || '동·세대에서 선택해주세요.'}
        </strong>
      </p>
      <CalendarPicker
        label={'첫 신규 관리비 부과월'}
        mode={'month'}
        value={opening.firstBillingMonth}
        disabled={opening.automaticBilling === true}
        onChange={(firstBillingMonth) => onChange({
          ...opening,
          firstBillingMonth
        })}
        required
      />
      <p>
        {opening.automaticBilling
          ? '기본 관리 통장 기준일이 월중이면 그달 전액부터, 월말이면 다음 달부터 부과합니다. 최종 등록 시 첫 부과월부터 현재 월까지 청구를 생성합니다. 기존 미납에 같은 기간 관리비가 중복되지 않는지 확인해주세요.'
          : '이전 초안의 첫 부과월입니다. 통장 기준일을 수정하면 부과월을 자동 계산합니다.'}
      </p>
    </section>
  );
  return (
    <section
      className={styles.panel}
      aria-label={'통장·동별 시작 잔고'}
    >
      <h3>
        통장·동별 시작 잔고
      </h3>
      <p>
        {'통장 실제 잔액은 기존 장부 기준일 '}
        <strong>
          {opening.cutoffDate}
        </strong>
        의 마감 금액입니다.
      </p>
      {!hideAccountAmount && (
        <AmountInput
          label={'통장 실제 잔액'}
          aria-label={'통장 실제 잔액'}
          value={opening.accountAmount}
          onChange={(accountAmount) => onChange({
            ...opening,
            accountAmount
          })}
          required
        />
      )}
      {building && (
        <>
          <h4>
            동별 보유금
          </h4>
          <p>
            각 동이 보유한 금액을 입력하세요. 미납 합계를 보유금으로 옮기지 않습니다.
          </p>
          <CalendarPicker
            label={'동별 잔고 기준일'}
            maxDate={getOpeningToday}
            value={opening.cashCutoffDate}
            onChange={(cashCutoffDate) => onChange({
              ...opening,
              cashCutoffDate
            })}
            required
          />
          {opening.cashCutoffDate !== opening.cutoffDate && opening.cashCutoffDate && (
            <p>
              동별 보유금은 장부 기준일과 다른 날짜의 금액입니다.
            </p>
          )}
          {!opening.cashCutoffDate && opening.cutoffDate && (
            <Button
              variant={'text'}
              onClick={() => onChange({
                ...opening,
                cashCutoffDate: opening.cutoffDate
              })}
            >
              장부 기준일과 같은 날짜 사용
            </Button>
          )}
          <div
            className={styles.row}
          >
            <SelectDropdown
              label={'보유금 입력 동'}
              value={building.clientId}
              onChange={setSelected}
              options={ordered.map((row) => ({
                value: row.clientId,
                label: row.name
              }))}
            />
            <AmountInput
              label={`${building.name} 시작 잔고`}
              aria-label={`${building.name} 시작 잔고`}
              value={opening.buildings[building.clientId] ?? ''}
              onChange={(amount) => onChange({
                ...opening,
                buildings: {
                  ...opening.buildings,
                  [building.clientId]: amount
                }
              })}
              required
            />
          </div>
          <p
            role={'status'}
          >
            {`입력 완료 ${entered.length} / ${buildings.length}개 동 · 보유금 합계 ${formatWon(total)}`}
          </p>
          {entered.length === buildings.length && /^[0-9]+$/.test(opening.accountAmount) && opening.cashCutoffDate === opening.cutoffDate && (
            <p>
              {'통장 잔액과 동별 합계의 차이: '}
              <strong>
                {formatWon(BigInt(opening.accountAmount) - total)}
              </strong>
              . 차이는 특정 동에 자동 배분하지 않습니다.
            </p>
          )}
        </>
      )}
      {!buildings.length && (
        <p>
          동 구분이 없는 건물은 통장 실제 잔액으로 시작합니다.
        </p>
      )}
      <p
        className={styles.hint}
      >
        기준일은 오늘(
        {getOpeningToday()}
        ) 또는 이전 날짜로 선택해주세요. 모르는 잔고는 0원으로 확정하지 마세요.
      </p>
    </section>
  );
}
