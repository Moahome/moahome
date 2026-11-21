'use client';

import { type DataTableColumn } from '@/shared/ui/data-table';
import { setMonthRangeQuery } from '@/shared/lib/month-range';
import { useRouter } from 'next/navigation';
import {
  useState,
  type ReactNode
} from 'react';
import type {
  BalanceBuilding,
  BalanceEntry,
  BalanceWorkspace
} from '../../../../../api/bankingBalanceApiTypes';
import { getBuildingLedger } from '../../../../../model/balanceLedger';
import { formatBalanceMoney } from '../../../../../lib/balanceMoney';
import styles from '../buildingLedger.module.css';
/** BuildingLedger의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBuildingLedger({
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

  const router = useRouter();
  const [direction, setDirection] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('LATEST');
  const [transactionDetail, setTransactionDetail] = useState<BalanceEntry | null>(null);

  /** 누적 잔고를 먼저 계산한 뒤 표시만 필터링해 입금·출금 필터가 잔고를 바꾸지 않게 합니다. */
  function openTransaction(entry: BalanceEntry) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const path = entry.paymentId ? `receipts/${entry.paymentId}` : `transactions/${entry.transactionId ?? entry.id}`;
      const query = new URLSearchParams({
        from: 'balance',
        buildingId: building.id
      });
      if (data.startMonth && data.startMonth !== data.month)
        setMonthRangeQuery(query, {
          startMonth: data.startMonth,
          endMonth: data.month
        });
      else
        query.set('month', data.month);
      if (data.accountId)
        query.set('account', data.accountId);
      router.push(`/manage/${propertyId}/banking/${path}?${query}`);

      return;
    }
    setTransactionDetail(entry);
  }

  // 누적 잔고는 과거부터 계산하고 정렬 선택은 계산된 행의 표시 순서에만 적용합니다.
  const entries = getBuildingLedger(building, data.entries, data.month, data.startMonth);
  if (sort === 'LATEST')
    entries.reverse();
  const columns: DataTableColumn<(typeof entries)[number]>[] = [
    {
      key: 'date',
      header: '거래일',
      width: 140,
      render: (e) => (
        <time
          className={styles['ledger-date']}
          dateTime={e.date}
        >
          {e.date}
        </time>
      )
    }, {
      key: 'label',
      header: direction === 'INCOME' ? '입금자' : direction === 'EXPENSE' ? '지출명' : '입금자·지출명',
      render: (e) => e.label
    },
    {
      key: 'income',
      header: '입금',
      render: (e) => BigInt(e.income) === BigInt(0) ? '—' : formatBalanceMoney(e.income)
    }, {
      key: 'expense',
      header: '출금',
      render: (e) => BigInt(e.expense) === BigInt(0) ? '—' : formatBalanceMoney(-BigInt(e.expense))
    }, {
      key: 'balance',
      header: '잔고',
      render: (e) => (
        <span
          data-negative={e.balance !== null && e.balance < BigInt(0)}
        >
          {formatBalanceMoney(e.balance)}
        </span>
      )
    }
  ];

  return {
    kind: 'ready' as const,
    building,
    data,
    propertyId,
    renderReceiptDetail,
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
  };
}
