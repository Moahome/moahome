'use client';

import { useChartDialog } from './_hooks/useChartDialog';
import { StateMessage } from '@/shared/ui/state-message';
import { SelectDropdown } from '@/shared/ui/form-controls';
import { type CSSProperties } from 'react';
import type { BalanceBuilding } from '../../../../api/bankingBalanceApiTypes';
import { sortExpenseLabels } from '../../../../model/expenseAllocation';
import { PagedTable } from '../balance-common/balanceCommon';
import { DetailDialog } from '../balance-common/balanceCommon';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './balanceChart.module.css';

/** 잔고가 아닌 확인된 입금·출금 합계의 비중을 표시해 음수 잔고나 동 수에 영향을 받지 않게 합니다. */
export function BalanceChart({
  rows
}: { rows: readonly BalanceBuilding[] }) {
  const income = rows.reduce((sum, row) => sum + BigInt(row.income), BigInt(0));
  const expense = rows.reduce((sum, row) => sum + BigInt(row.expense), BigInt(0));
  const total = income + expense;
  const net = income - expense;
  const share = total ? Number(income * BigInt(10000) / total) / 100 : 0;

  return (
    <span
      className={styles['donut-panel']}
    >
      <span
        className={styles.donut}
        data-empty={total === BigInt(0)}
        style={{
          '--chart-share': `${share}%`
        } as CSSProperties}
        role={'img'}
        aria-label={`입금 ${formatBalanceMoney(income)}, 출금 ${formatBalanceMoney(-expense)}, 월 입출금 차액 ${formatBalanceMoney(net)}`}
      >
        <span
          className={styles['donut-center']}
        >
          <span>
            월 입출금 차액
          </span>
          <strong
            data-negative={net < BigInt(0)}
          >
            {formatBalanceMoney(net)}
          </strong>
        </span>
      </span>
      <span
        className={styles['donut-legend']}
      >
        <span>
          <span
            className={styles['donut-marker']}
            data-kind={'income'}
          />
          입금
          {' '}
          <strong>
            {formatBalanceMoney(income)}
          </strong>
        </span>
        <span>
          <span
            className={styles['donut-marker']}
            data-kind={'expense'}
          />
          출금
          {' '}
          <strong>
            {formatBalanceMoney(-expense)}
          </strong>
        </span>
      </span>
    </span>
  );
}

/** 검색 가능한 동 선택 하나로 그래프와 표의 조회 범위를 함께 변경합니다. */
export function ChartDialog({
  buildings,
  onClose,
  presentation = 'modal'
}: { buildings: readonly BalanceBuilding[];
onClose: () => void;
presentation?: 'modal' | 'page' }) {
  const state = useChartDialog({
    buildings,
    onClose,
    presentation
  });

  const {
    building,
    setBuilding,
    rows
  } = state;

  return (
    <DetailDialog
      title={'동별 입금·지출 비교'}
      className={styles['chart-dialog']}
      presentation={presentation}
      onClose={onClose}
    >
      <div
        className={styles['chart-controls']}
      >
        <SelectDropdown
          label={'동 선택'}
          value={building}
          onChange={setBuilding}
          options={[{
            value: 'ALL',
            label: '전체 동'
          }, ...sortExpenseLabels(buildings).map((row) => ({
            value: row.id,
            label: row.label
          }))]}
        />
      </div>
      <div
        className={styles['chart-expanded']}
      >
        {rows.length ? (
          <BalanceChart
            rows={rows}
          />
        ) : (
          <StateMessage
            variant={building !== 'ALL' ? 'no-results' : 'empty-data'}
            layout={'inline'}
            title={'조건에 맞는 동이 없습니다.'}
          />
        )}
      </div>
      <PagedTable
        label={'동별 입금 출금 비교'}
        hasFilters={building !== 'ALL'}
        rows={rows}
        columns={[
          {
            key: 'building',
            header: '동',
            render: (row) => row.label
          },
          {
            key: 'income',
            header: '입금',
            render: (row) => formatBalanceMoney(row.income)
          },
          {
            key: 'expense',
            header: '출금',
            render: (row) => formatBalanceMoney(-BigInt(row.expense))
          }
        ]}
      />
    </DetailDialog>
  );
}