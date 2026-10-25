'use client';

import { useState } from 'react';
import type {
  BillingBuilding,
  BillingTemplate
} from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  getBillingPlan,
  sumBillingItems
} from '../../../model/billing';
import styles from './billingTemplateSummary.module.css';

/** 각 동의 세대당 금액을 합산하지 않고 최소·최대 범위로 요약합니다. */
function amountRange(amounts: bigint[]): string {
  if (!amounts.length) return '미설정';
  const min = amounts.reduce((a, b) => a < b ? a : b);
  const max = amounts.reduce((a, b) => a > b ? a : b);
  return min === max ? formatWon(min) : `${formatWon(min)} ~ ${formatWon(max)}`;
}

/** 항목별 비교는 표시용으로만 묶고 실제 저장·부과는 각 동의 독립 설정을 유지합니다. */
export function BillingTemplateSummary({ template, buildings, label, showTemporary = true }: {
  template: BillingTemplate;
  buildings: BillingBuilding[];
  label: string;
  showTemporary?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const plan = getBillingPlan(template);
  const groups = plan.mode === 'ALL' ? [{
    buildingId: null,
    items: plan.items
  }]
    : plan.buildingItems.filter((group) => buildings.some((building) => building.id === group.buildingId));
  const rows = new Map<string, { id: string; name: string; amounts: Map<string | null, bigint> }>();
  for (const group of groups) {
    const occurrences = new Map<string, number>();
    for (const item of group.items) {
      const identity = `${item.code ?? ''}:${item.name}`;
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      const key = `${identity}:${occurrence}`;
      const row = rows.get(key) ?? {
        id: key,
        name: item.name,
        amounts: new Map<string | null, bigint>()
      };
      row.amounts.set(group.buildingId, BigInt(item.amount));
      rows.set(key, row);
    }
  }
  const totals = groups.map((group) => sumBillingItems(group.items));
  const mode = plan.mode === 'ALL' ? '전체 부과' : '동별 부과';

  return (
    <div
      className={styles.content}
    >
      <p
        className={styles.mode}
      >
        {mode}
        {' '}
        ·
        {' '}
        {rows.size}
        개 항목
      </p>
      <DataTable
        label={label}
        rows={[...rows.values()]}
        getRowKey={(row) => row.id}
        minWidth={260}
        emptyState={'등록된 항목이 없어요.'}
        expandedRowKey={expanded}
        renderExpandedRow={plan.mode === 'BUILDING' ? (row) => (
          <dl
            className={styles.buildings}
          >
            {buildings.map((building) => (
              <div
                key={building.id}
              >
                <dt>
                  {building.name}
                </dt>
                <dd>
                  {row.amounts.has(building.id) ? formatWon(row.amounts.get(building.id)!) : '미부과'}
                </dd>
              </div>
            ))}
          </dl>
        ) : undefined}
        columns={[
          {
            key: 'name',
            header: '항목',
            rowHeader: true,
            render: (row) => plan.mode === 'ALL' ? row.name : (
              <Button
                variant={'ghost'}
                className={styles['item-toggle']}
                aria-expanded={expanded === row.id}
                aria-label={`${row.name} 동별 금액`}
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              >
                {row.name}
                <ServiceIcon
                  name={'chevron'}
                  direction={'down'}
                  size={16}
                  className={styles.chevron}
                />
              </Button>
            )
          },
          {
            key: 'mode',
            header: '적용 현황',
            render: (row) => {
              const same = plan.mode === 'ALL' || row.amounts.size === buildings.length && new Set([...row.amounts.values()].map(String)).size === 1;
              return (
                <span
                  className={styles.badge}
                >
                  {same ? '모든 동 동일' : '동별 금액 다름'}
                </span>
              );
            }
          },
          {
            key: 'amount',
            header: '세대당 금액',
            align: 'right',
            render: (row) => amountRange([...row.amounts.values()])
          }
        ]}
      />
      <div
        className={styles.total}
      >
        <span>
          세대당 기본 합계
        </span>
        <strong>
          {amountRange(totals)}
        </strong>
      </div>
      {showTemporary && plan.temporaryItems.length > 0 && (
        <section
          className={styles.temporary}
        >
          <h3>
            {template.effectiveMonth.replace('-', '년 ')}
            월 한정 임시 부과
          </h3>
          <p>
            {plan.temporaryMode === 'ALL' ? '전체 부과' : '동별 부과'}
            {' '}
            · 해당 월이 지나면 자동 종료
          </p>
          <ul>
            {plan.temporaryItems.map((item) => (
              <li
                key={item.id}
              >
                <span>
                  {plan.temporaryMode === 'ALL' ? '전체 동' : buildings.find((building) => building.id === item.buildingId)?.name ?? '삭제된 동'}
                  {' '}
                  ·
                  {' '}
                  {item.name}
                  {item.note && (
                    <small>
                      {item.note}
                    </small>
                  )}
                </span>
                <strong>
                  세대당
                  {formatWon(item.amount)}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
