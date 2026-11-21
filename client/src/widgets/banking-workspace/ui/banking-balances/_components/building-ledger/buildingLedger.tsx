'use client';

import {
  BALANCE_LEDGER_DIRECTION_OPTIONS,
  BALANCE_LEDGER_KIND_OPTIONS
} from '../../../../constant/bankingOptions';

import { useBuildingLedger } from './_hooks/useBuildingLedger';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { formatMonthRange } from '@/shared/lib/month-range';
import { type ReactNode } from 'react';
import type {
  BalanceBuilding,
  BalanceWorkspace
} from '../../../../api/bankingBalanceApiTypes';
import { BankingExpensePage } from '../../../banking-expense-page/bankingExpensePage';
import { PagedTable } from '../balance-common/balanceCommon';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './buildingLedger.module.css';

export function BuildingLedger({
  building,
  data,
  propertyId,
  renderReceiptDetail
}: {
    building: BalanceBuilding;
    data: BalanceWorkspace;
    propertyId: string;
    renderReceiptDetail?: (paymentId: string, onClose: () => void) => ReactNode;
}) {
  const state = useBuildingLedger({
    building,
    data,
    propertyId,
    renderReceiptDetail
  });

  const {
    direction,
    setDirection,
    search,
    setSearch,
    sort,
    setSort,
    transactionDetail,
    setTransactionDetail,
    openTransaction,
    entries,
    columns
  } = state;

  return (
    <div
      className={styles.ledger}
    >
      <div
        className={styles['ledger-summary']}
      >
        <div>
          <span>
            기초 잔고
          </span>
          <strong
            data-negative={building.startBalance !== null && BigInt(building.startBalance!) < BigInt(0)}
          >
            {formatBalanceMoney(building.startBalance)}
          </strong>
        </div>
        <div>
          <span>
            {data.startMonth && data.startMonth !== data.month ? '기간 입금' : '월 입금'}
          </span>
          <strong>
            {formatBalanceMoney(building.income)}
          </strong>
        </div>
        <div>
          <span>
            {data.startMonth && data.startMonth !== data.month ? '기간 지출' : '월 지출'}
          </span>
          <strong>
            {formatBalanceMoney(building.expense)}
          </strong>
        </div>
        <div>
          <span>
            {data.startMonth && data.startMonth !== data.month ? '기말 잔고' : '월말 잔고'}
          </span>
          <strong
            data-negative={building.balance !== null && BigInt(building.balance!) < BigInt(0)}
          >
            {formatBalanceMoney(building.balance)}
          </strong>
        </div>
      </div>
      <p
        className={styles.muted}
      >
        {formatMonthRange({
          startMonth: data.startMonth ?? data.month,
          endMonth: data.month
        })}
        {' '}
        · 잔고 기준일
        {' '}
        {data.cutoffDate ?? '미설정'}
        {' '}
        의 잔고에서 조회 기간의 입출금을 계산합니다.
      </p>
      <PagedTable
        label={'동별 상세 원장'}
        hasFilters={Boolean(search.trim() || direction !== 'ALL')}
        rows={entries.filter((entry) => (direction === 'ALL' || BigInt(direction === 'INCOME' ? entry.income : entry.expense) > BigInt(0)) && entry.label.includes(search.trim()))}
        onRowClick={openTransaction}
        toolbar={(
          <>
            <Input
              label={'원장 검색'}
              placeholder={'입금자·지출명 검색'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Dropdown
              label={'입출금 구분'}
              value={direction}
              onChange={setDirection}
              options={BALANCE_LEDGER_DIRECTION_OPTIONS}
            />
            <Dropdown
              label={'정렬'}
              value={sort}
              onChange={setSort}
              options={BALANCE_LEDGER_KIND_OPTIONS}
            />
          </>
        )}
        columns={columns.filter((column) => !(direction === 'INCOME' && column.key === 'expense') && !(direction === 'EXPENSE' && column.key === 'income'))}
      />
      {transactionDetail && (transactionDetail.paymentId ? renderReceiptDetail?.(transactionDetail.paymentId, () => setTransactionDetail(null)) : (
        <BankingExpensePage
          propertyId={propertyId}
          transactionId={transactionDetail.transactionId ?? transactionDetail.id}
          presentation={'modal'}
          onClose={() => setTransactionDetail(null)}
        />
      ))}
    </div>
  );
}