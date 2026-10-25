'use client';

import {
  useRef,
  useState,
  type FormEvent
} from 'react';
import type {
  BillingItem,
  BillingMode,
  BillingPlan,
  BillingSettings,
  BillingTemporaryItem
} from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  AmountInput,
  Dropdown,
  Input,
  Radio
} from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { formatBillingMonth } from '../../../lib/billingLabel';
import {
  getBillingPlan,
  getBillingPlanError,
  getPlanItems,
  getTemporarySettingsError,
  sumBillingItems
} from '../../../model/billing';
import type { ScheduledSettings } from '../../../model/billingTypes';
import { BillingAccordion } from '../billing-accordion/billingAccordion';
import { AmountCalculator } from '@/shared/ui/amount-calculator';
import { BillingTemplateSummary } from '../billing-template-summary/billingTemplateSummary';
import {
  BillingItemEditor,
  BillingItemFields
} from './billingItemEditor';
import styles from './billingSettingsForm.module.css';

/** 두 부과 범위를 독립적으로 편집하고 다음 달 한정 항목을 반복 설정과 구분해 저장합니다. */
export function BillingSettingsForm({ settings, nextMonth, onApply, busy, errorMessage }: {
  settings: BillingSettings;
  nextMonth: string;
  onApply: (settings: ScheduledSettings) => Promise<boolean>;
  busy: boolean;
  errorMessage: string;
}) {
  const buildings = settings.buildings ?? [];
  const sourcePlan = getBillingPlan(settings.scheduled ?? settings.current, Boolean(settings.scheduled));
  // 예약 뒤 동 목록이 바뀌어도 현재 동마다 편집할 자리를 두고 누락 금액은 직접 입력하게 합니다.
  const seed: BillingPlan = {
    ...sourcePlan,
    buildingItems: sourcePlan.mode === 'BUILDING' ? buildings.map((building) => sourcePlan.buildingItems
      .find((group) => group.buildingId === building.id) ?? {
      buildingId: building.id,
      items: []
    }) : []
  };
  const [draft, setDraft] = useState(seed);
  const request = useRef({
    fingerprint: '',
    id: ''
  });

  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const counter = useRef(0);
  const plan: BillingPlan = {
    ...draft,
    items: draft.mode === 'ALL' ? draft.items : [],
    buildingItems: draft.mode === 'BUILDING' ? draft.buildingItems : [],
    temporaryMode: draft.temporaryMode,
    temporaryItems: draft.temporaryItems.map((item) => ({
      ...item,
      buildingId: draft.temporaryMode === 'ALL' ? null : item.buildingId,
      month: item.month ?? nextMonth
    }))
  };
  const immediate = plan.temporaryItems.some((item) => item.month === settings.currentMonth);
  const futurePlan: BillingPlan = {
    ...plan,
    temporaryItems: plan.temporaryItems.filter((item) => item.month === nextMonth)
  };
  const currentPlan: BillingPlan = {
    ...plan,
    mode: 'ALL',
    items: [],
    buildingItems: [],
    temporaryItems: plan.temporaryItems.filter((item) => item.month === settings.currentMonth)
  };
  const changed = JSON.stringify(plan) !== JSON.stringify(seed);
  const error = getBillingPlanError(futurePlan, reason, buildings.map((building) => building.id))
    ?? getTemporarySettingsError(currentPlan.temporaryItems, currentPlan.temporaryMode, reason, buildings.map((building) => building.id));
  const previewError = getBillingPlanError(futurePlan, '미리보기', buildings.map((building) => building.id));
  const previews = (buildings.length ? buildings : [{
    id: '',
    name: '전체 세대'
  }]).map((building) => {
    const basePlan = {
      ...futurePlan,
      temporaryItems: []
    };
    const base = previewError ? null : sumBillingItems(getPlanItems(basePlan, building.id || null));
    const total = previewError ? null : sumBillingItems(getPlanItems(futurePlan, building.id || null));
    const currentExtra = currentPlan.temporaryItems.every((item) => /^-?[0-9]+$/.test(item.amount))
      ? sumBillingItems(getPlanItems(currentPlan, building.id || null)) : null;
    return {
      ...building,
      base,
      total,
      currentExtra,
      extra: total === null || base === null ? null : total - base
    };
  });

  function changeTemporaryItems(items: BillingTemporaryItem[]) {
    setDraft({
      ...draft,
      temporaryItems: items
    });
  }

  function changeTemporaryMode(mode: BillingMode) {
    setDraft({
      ...draft,
      temporaryMode: mode
    });
  }

  function newItem(): BillingItem {
    counter.current += 1;
    return {
      id: `new-${counter.current}`,
      code: null,
      name: '',
      amount: ''
    };
  }

  /** 전체 금액을 동별 편집의 초기값으로 복사할 뿐 이후 동별 설정에 공통값을 상속하지 않습니다. */
  function changeBaseMode(mode: BillingMode) {
    setDraft((previous) => ({
      ...previous,
      mode,
      items: mode === 'ALL' && !previous.items.length ? (previous.buildingItems[0]?.items ?? []).map((item) => ({
        ...item
      })) : previous.items,
      buildingItems: mode === 'BUILDING' ? buildings.map((building) => previous.buildingItems.find((group) => group.buildingId === building.id)
        ?? {
          buildingId: building.id,
          items: previous.items.map((item) => ({
            ...item
          }))
        }) : previous.buildingItems
    }));
  }

  /** 검증된 기본·임시 설정을 한 번 저장하며 같은 내용의 즉시 부과 재시도에는 같은 요청 ID를 사용합니다. */
  async function applySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (error || !changed || busy) return;
    const fingerprint = JSON.stringify({
      plan,
      temporaryMonth: nextMonth,
      reason: reason.trim()
    });
    if (immediate && request.current.fingerprint !== fingerprint) {
      request.current = {
        fingerprint,
        id: crypto.randomUUID()
      };
    }
    await onApply({
      ...plan,
      month: nextMonth,
      temporaryMonth: nextMonth,
      requestId: immediate ? request.current.id : undefined,
      reason: reason.trim()
    });
  }

  return (
    <div
      className={styles.content}
    >
      <ListCard>
        <BillingAccordion
          title={'현재 적용 항목'}
          summary={settings.current.mode === 'BUILDING' ? '동별 부과 · 당월 기준' : `세대당 합계 ${formatWon(sumBillingItems(settings.current.items))} · 당월 기준`}
        >
          <BillingTemplateSummary
            template={settings.current}
            buildings={buildings}
            label={'현재 적용 항목'}
          />
        </BillingAccordion>
      </ListCard>
      <form
        className={styles.form}
        onSubmit={applySettings}
        noValidate
      >
        <fieldset
          className={styles.fields}
          disabled={busy}
        >
          <ListCard>
            <div
              className={styles['card-heading']}
            >
              <div>
                <h2>
                  다음 달 적용 설정
                </h2>
                <p>
                  {formatBillingMonth(nextMonth)}
                  {' '}
                  1일부터 매월 적용
                </p>
              </div>
              <span
                className={styles.badge}
              >
                기본 부과
              </span>
            </div>
            <fieldset
              className={styles['mode-options']}
            >
              <legend>
                기본 부과 방식
              </legend>
              <Radio
                name={'base-billing-mode'}
                variant={'card'}
                label={'전체 부과'}
                description={'모든 동에 동일한 항목과 금액 적용'}
                checked={draft.mode === 'ALL'}
                onChange={() => changeBaseMode('ALL')}
              />
              <Radio
                name={'base-billing-mode'}
                variant={'card'}
                label={'동별 부과'}
                description={'각 동의 항목과 금액을 따로 설정'}
                checked={draft.mode === 'BUILDING'}
                disabled={!buildings.length}
                onChange={() => changeBaseMode('BUILDING')}
              />
            </fieldset>
            {draft.mode === 'ALL' ? (
              <section
                className={styles['base-editor']}
                aria-label={'전체 동 기본 항목 설정'}
              >
                <BillingItemEditor
                  title={'전체 동 기본 항목 설정'}
                  items={draft.items}
                  onChange={(items) => setDraft({
                    ...draft,
                    items
                  })}
                  onAdd={() => setDraft({
                    ...draft,
                    items: [...draft.items, newItem()]
                  })}
                />
              </section>
            ) : (
              <section
                className={styles['base-editor']}
                aria-label={'동별 기본 항목 설정'}
              >
                <div
                  className={styles['building-toolbar']}
                >
                  <h3>
                    동별 기본 항목 설정
                  </h3>
                  <Input
                    aria-label={'동 검색'}
                    placeholder={'동 검색'}
                    value={buildingSearch}
                    onChange={(event) => setBuildingSearch(event.target.value)}
                  />

                </div>
                {buildings.filter((building) => building.name.includes(buildingSearch.trim())).map((building) => {
                  const group = draft.buildingItems.find((group) => group.buildingId === building.id);
                  const items = group?.items ?? [];
                  const total = items.every((item) => /^-?[0-9]+$/.test(item.amount)) ? formatWon(sumBillingItems(items)) : '금액 입력 중';
                  const changeItems = (items: BillingItem[]) => setDraft((previous) => ({
                    ...previous,
                    buildingItems: previous.buildingItems.map((group) => group.buildingId === building.id ? {
                      ...group,
                      items
                    } : group)
                  }));
                  return (
                    <div
                      key={building.id}
                      className={styles['building-card']}
                    >
                      <BillingAccordion
                        title={building.name}
                        summary={`${items.length}개 항목 · 세대당 ${total}`}
                      >
                        <BillingItemEditor
                          items={items}
                          onChange={changeItems}
                          onAdd={() => changeItems([...items, newItem()])}
                        />
                      </BillingAccordion>
                    </div>
                  );
                })}
                {!buildings.some((building) => building.name.includes(buildingSearch.trim())) && (
                  <p
                    className={styles.empty}
                  >
                    검색한 동이 없습니다.
                  </p>
                )}
              </section>
            )}
          </ListCard>
          <ListCard>
            <div
              className={styles['card-heading']}
            >
              <div>
                <h2>
                  일회성 임시 부과
                </h2>
                <p>
                  이번 달 항목은 즉시 추가 부과하고, 다음 달 항목은 예약합니다.
                </p>
              </div>
              <div
                className={styles['header-actions']}
              >
                <Button
                  variant={'outline'}
                  size={'sm'}
                  onClick={() => setCalculatorOpen(true)}
                >
                  금액 계산기
                </Button>
                <Button
                  variant={'outline'}
                  size={'sm'}
                  onClick={() => changeTemporaryItems([...plan.temporaryItems, {
                    ...newItem(),
                    buildingId: null,
                    note: '',
                    month: nextMonth
                  }])}
                  leadingIcon={(
                    <ServiceIcon
                      name={'plus'}
                    />
                  )}
                >
                  임시 부과 추가
                </Button>
              </div>
            </div>
            <fieldset
              className={styles['mode-options']}
            >
              <legend>
                임시 부과 방식
              </legend>
              <Radio
                name={'temporary-billing-mode'}
                variant={'card'}
                label={'전체 부과'}
                description={'모든 동의 대상 세대에 추가'}
                checked={plan.temporaryMode === 'ALL'}
                onChange={() => changeTemporaryMode('ALL')}
              />
              <Radio
                name={'temporary-billing-mode'}
                variant={'card'}
                label={'동별 부과'}
                description={'선택한 동의 대상 세대에 추가'}
                checked={plan.temporaryMode === 'BUILDING'}
                disabled={!buildings.length}
                onChange={() => changeTemporaryMode('BUILDING')}
              />
            </fieldset>
            {!plan.temporaryItems.length && (
              <p
                className={styles.empty}
              >
                등록된 임시 부과가 없습니다.
              </p>
            )}
            {plan.temporaryItems.map((item, index) => (
              <section
                key={item.id}
                className={styles['temporary-row']}
                role={'group'}
                aria-label={`임시 부과 ${index + 1}`}
              >
                <div
                  className={styles['temporary-header']}
                >
                  <h3>
                    {`임시 부과 ${index + 1}`}
                  </h3>
                  <Button
                    className={styles['item-delete']}
                    variant={'ghost'}
                    size={'sm'}
                    iconOnly
                    aria-label={`임시 부과 ${index + 1} 삭제`}
                    onClick={() => changeTemporaryItems(plan.temporaryItems.filter((current) => current.id !== item.id))}
                    leadingIcon={(
                      <ServiceIcon
                        name={'close'}
                      />
                    )}
                  />
                </div>
                <div
                  className={styles['temporary-fields']}
                >
                  <Dropdown
                    label={'적용 월'}
                    value={item.month ?? nextMonth}
                    required
                    options={[
                      ...(settings.managementStarted !== false && settings.firstBillingMonth <= settings.currentMonth ? [{
                        value: settings.currentMonth,
                        label: formatBillingMonth(settings.currentMonth)
                      }] : []),
                      {
                        value: nextMonth,
                        label: formatBillingMonth(nextMonth)
                      }
                    ]}
                    onChange={(month) => changeTemporaryItems(plan.temporaryItems.map((current) => current.id === item.id ? {
                      ...current,
                      month
                    } : current))}
                  />
                  {plan.temporaryMode === 'BUILDING' ? (
                    <Dropdown
                      label={'부과 대상 동'}
                      required
                      placeholder={'동 선택'}
                      value={item.buildingId ?? ''}
                      options={buildings.map((building) => ({
                        value: building.id,
                        label: building.name
                      }))}
                      onChange={(buildingId) => changeTemporaryItems(plan.temporaryItems.map((current) => current.id === item.id ? {
                        ...current,
                        buildingId
                      } : current))}
                    />
                  ) : (
                    <div
                      className={styles['fixed-value']}
                    >
                      <span>
                        부과 대상
                      </span>
                      <strong>
                        전체 동
                      </strong>
                    </div>
                  )}
                </div>
                <div
                  className={styles['temporary-fields']}
                >
                  <BillingItemFields
                    item={item}
                    labelPrefix={`임시 항목 ${index + 1}`}
                    onChange={(updated) => changeTemporaryItems(plan.temporaryItems.map((current) => current.id === item.id ? {
                      ...current,
                      ...updated
                    } : current))}
                  />
                  <AmountInput
                    label={'세대당 추가 금액'}
                    value={item.amount}
                    required
                    maxLength={24}
                    trailingContent={'원'}
                    onChange={(amount) => changeTemporaryItems(plan.temporaryItems.map((current) => current.id === item.id ? {
                      ...current,
                      amount
                    } : current))}
                  />
                </div>
                <Input
                  label={'비고'}
                  value={item.note}
                  maxLength={500}
                  placeholder={'예: 승강기 보수 공사'}
                  onChange={(event) => changeTemporaryItems(plan.temporaryItems.map((current) => current.id === item.id ? {
                    ...current,
                    note: event.target.value
                  } : current))}
                />
              </section>
            ))}
          </ListCard>
          <ListCard>
            <h2>
              다음 달 부과 미리보기
            </h2>
            <p
              className={styles.description}
            >
              부과 대상 세대마다 적용될 금액입니다. 공실은 제외됩니다.
            </p>
            {previewError ? (
              <p
                className={styles.empty}
              >
                {previewError}
              </p>
            ) : (
              <DataTable
                label={'동별 부과 미리보기'}
                rows={previews}
                getRowKey={(row) => row.id}
                minWidth={260}
                emptyState={'설정할 동이 없습니다.'}
                columns={[
                  {
                    key: 'building',
                    header: '대상',
                    rowHeader: true,
                    render: (row) => row.name
                  },
                  ...([{
                    key: 'base',
                    header: '기본',
                    align: 'right' as const,
                    render: (row: typeof previews[number]) => formatWon(row.base!)
                  }]),
                  {
                    key: 'extra',
                    header: '임시',
                    align: 'right' as const,
                    render: (row) => formatWon(row.extra!)
                  },
                  ...([{
                    key: 'total',
                    header: '세대당 합계',
                    align: 'right' as const,
                    render: (row: typeof previews[number]) => (
                      <strong>
                        {formatWon(row.total!)}
                      </strong>
                    )
                  }])
                ]}
              />
            )}
          </ListCard>
          {immediate && (
            <ListCard>
              <h2>
                이번 달 추가 부과 미리보기
              </h2>
              <p
                className={styles.description}
              >
                기존 청구·납부는 유지하고 아래 금액만 추가합니다. 납부기한은 이번 달 말일입니다.
              </p>
              <DataTable
                label={'이번 달 임시 부과 미리보기'}
                rows={previews}
                getRowKey={(row) => row.id}
                minWidth={260}
                emptyState={'부과 대상이 없습니다.'}
                columns={[
                  {
                    key: 'building',
                    header: '대상',
                    rowHeader: true,
                    render: (row) => row.name
                  },
                  {
                    key: 'amount',
                    header: '세대당 추가 금액',
                    align: 'right',
                    render: (row) => row.currentExtra === null ? '금액 입력 중' : formatWon(row.currentExtra)
                  }
                ]}
              />
            </ListCard>
          )}
          <ListCard>
            <Input
              label={'수정 사유'}
              value={reason}
              required
              maxLength={1000}
              placeholder={'예: 102동 승강기 보수에 따른 임시 부과'}
              error={(submitted || reasonTouched) && !reason.trim() ? '수정 사유를 입력해주세요.' : undefined}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setReasonTouched(true)}
            />
            {submitted && error && reason.trim() && (
              <p
                className={styles.error}
                role={'alert'}
              >
                {error}
              </p>
            )}
            {errorMessage && (
              <p
                className={styles.error}
                role={'alert'}
              >
                {errorMessage}
              </p>
            )}
            <div
              className={styles.actions}
            >
              <p>
                0원·음수 금액을 입력할 수 있습니다.
                <br />
                {immediate ? '임시 항목은 이번 달 즉시 추가 부과되며 기본 설정 변경은 다음 달부터 적용됩니다.' : '당월과 과거 청구에는 영향을 주지 않습니다.'}
              </p>
              <Button
                type={'submit'}
                disabled={!changed || busy}
              >
                {busy ? '저장 중…' : immediate ? '이번 달 추가 부과' : '다음 달 예약 저장'}
              </Button>
            </div>
          </ListCard>
        </fieldset>
      </form>
      <AmountCalculator
        title={'부과 금액 계산기'}
        description={'참고용 · 부과 금액에 자동 반영되지 않습니다.'}
        countLabel={'나눌 세대 수'}
        countUnit={'세대'}
        resultLabel={'세대당 금액'}
        open={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
      />
    </div>
  );
}
