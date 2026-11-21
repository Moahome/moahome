'use client';

import { useSearchParams } from 'next/navigation';
import {
  useRef,
  useState
} from 'react';
import type { Action } from '../../../model/balancePanelTypes';

/** 통장 BalanceFilters 상태를 한 책임으로 관리합니다. */
export function useBankingBalanceFilters(params: ReturnType<typeof useSearchParams>) {

  const [search, setSearch] = useState(params.get('search') ?? '');

  const [sort, setSort] = useState('name');

  const [filter, setFilter] = useState(params.get('filter') ?? 'ALL');

  const [incomeBuilding, setIncomeBuilding] = useState('ALL');

  const [incomeSearch, setIncomeSearch] = useState('');

  const [externalFilter, setExternalFilter] = useState(() => params.get('externalStatus') === 'UNRECOVERED' ? 'UNRECOVERED' : 'ACTIVE');

  const [externalSearch, setExternalSearch] = useState('');

  return {
    search,
    setSearch,
    sort,
    setSort,
    filter,
    setFilter,
    incomeBuilding,
    setIncomeBuilding,
    incomeSearch,
    setIncomeSearch,
    externalFilter,
    setExternalFilter,
    externalSearch,
    setExternalSearch
  };
}

/** 통장 BalancePanels 상태를 한 책임으로 관리합니다. */
export function useBankingBalancePanels(params: ReturnType<typeof useSearchParams>) {

  const [detail, setDetail] = useState<string | null>(null);

  const [accountDetailId, setAccountDetailId] = useState<string | null>(null);

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const [historyAccountId, setHistoryAccountId] = useState<string | null>(null);

  const [initialAccountId, setInitialAccountId] = useState<string | null>(() => params.get('initial'));

  const [chartOpen, setChartOpen] = useState(false);

  const [action, setAction] = useState<Action | null>(null);

  return {
    detail,
    setDetail,
    accountDetailId,
    setAccountDetailId,
    editingAccountId,
    setEditingAccountId,
    historyAccountId,
    setHistoryAccountId,
    initialAccountId,
    setInitialAccountId,
    chartOpen,
    setChartOpen,
    action,
    setAction
  };
}

/** 통장 BalanceFeedback 상태를 한 책임으로 관리합니다. */
export function useBankingBalanceFeedback() {

  const [notice, setNotice] = useState<{ message: string;
tone: 'success' | 'error' } | null>(null);

  const [exporting, setExporting] = useState(false);

  const exportBusy = useRef(false);

  const downloadButton = useRef<HTMLButtonElement>(null);

  return {
    notice,
    setNotice,
    exporting,
    setExporting,
    exportBusy,
    downloadButton
  };
}
