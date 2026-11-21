'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { BalanceWorkspace } from '../../../api/bankingBalanceApiTypes';

import {
  useBankingBalanceFilters,
  useBankingBalancePanels,
  useBankingBalanceFeedback
} from './useBankingBalancesState';
import { useBankingBalanceNavigation } from './useBankingBalanceNavigation';
import { useBankingBalanceDownload } from './useBankingBalanceDownload';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import {
  formatMonthRange,
  getQueryMonthRange,
  getMonthRangeQuery
} from '@/shared/lib/month-range';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useEffect,
  type ReactNode
} from 'react';
import {
  getAccountBalanceTotal,
  getBalancePeriodLabel
} from '../../../model/accountBalance';
import { getBalanceSummary } from '../../../model/balanceLedger';
import { sortExpenseLabels } from '../../../model/expenseAllocation';
import { useReportDownload } from '@/shared/ui/report-download';
import type { BalancePanel } from '../../../model/balancePanelTypes';
import { PANEL_TITLES } from '../../../constant/bankingOptions';
/** BankingBalances의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBankingBalances({
  propertyId,
  buildingId,
  panel,
  renderReceiptDetail
}: {
    propertyId: string;
    buildingId?: string;
    panel?: BalancePanel;
    renderReceiptDetail?: (paymentId: string, onClose: () => void) => ReactNode;
}, query: UseQueryResult<BalanceWorkspace, Error>) {

  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const cache = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const range = getQueryMonthRange(params);
  const month = range.endMonth;
  const startMonth = range.startMonth;
  const periodLabel = formatMonthRange(range);
  const accountId = params.get('account') ?? 'ALL';
  const buildingFilter = params.get('building') ?? 'ALL';
  const {
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
  } = useBankingBalanceFilters(params);

  const {
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
  } = useBankingBalancePanels(params);

  const {
    notice,
    setNotice,
    exporting,
    setExporting,
    exportBusy,
    downloadButton
  } = useBankingBalanceFeedback();

  const {
    openDownload
  } = useReportDownload();

  const data = query.data!;
  // 공유한 정정 링크도 PC에서는 목록 위 모달로 열고 모바일에서는 기존 상세 경로를 사용합니다.
  useEffect(() => {
    const target = params.get('initial');
    if (!target || panel)
      return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      const next = new URLSearchParams(params.toString());
      next.delete('initial');
      next.set('target', target);
      router.replace(`/manage/${propertyId}/banking/balances/details/initial?${next}`);

      return;
    }
  }, [params, panel, propertyId, router]);
  useEffect(() => {
    if (!data || query.isFetching || params.get('externalStatus') !== 'UNRECOVERED')
      return;
    document.getElementById('external-settlements')?.scrollIntoView({
      block: 'start'
    });
  }, [data, query.isFetching, params]);
  // 사용 전 월의 오래된 선택 URL도 서버가 확정한 전체 범위로 맞춰 새로고침·상세 이동에서 되살아나지 않게 합니다.
  useEffect(() => {
    if (!data?.accounts || data.accountId !== null || accountId === 'ALL' || data.accounts.some((account) => account.id === accountId))
      return;
    const next = new URLSearchParams(params.toString());
    next.set('account', 'ALL');
    router.replace(`?${next}`, {
      scroll: false
    });
  }, [data, accountId, params, router]);
  const title = panel ? PANEL_TITLES[panel] : buildingId ? '동별 상세 원장' : '잔고·정산';

  const summary = getBalanceSummary(data);
  const selectedAccount = data.accounts?.find((account) => account.id === accountId);
  const {
    amount: bankBalance
  } = getAccountBalanceTotal(data);
  const bankLabel = selectedAccount ? '선택 통장 잔액' : '통장 잔액 합계';
  const bankAsOf = getBalancePeriodLabel(month);
  const bankHelp = '등록된 통장 잔액을 표시합니다.';
  const differenceDescription = '통장 잔액 − 동별 잔고';
  const missing = data.buildings.filter((b) => b.active && b.status === 'OPENING_REQUIRED');
  const buildings = sortExpenseLabels(data.buildings);
  const selectedBuilding = buildings.find((building) => building.id === buildingFilter);
  // 동 필터는 목록·그래프·다운로드 범위를 좁히며 통장 전체 잔액과 전체 동의 대조 기준은 유지합니다.
  const filtered = buildings.filter((b) => (!selectedBuilding || b.id === selectedBuilding.id) && b.label.includes(search.trim()) && (filter === 'ALL' || (filter === 'NEEDS_OPENING' && b.status === 'OPENING_REQUIRED') || (filter === 'NEGATIVE' && b.balance !== null && BigInt(b.balance) < BigInt(0))));
  if (sort !== 'name')
    filtered.sort((a, b) => {
      if (a.balance === null || b.balance === null)
        return a.balance === b.balance ? 0 : a.balance === null ? 1 : -1;
      const left = BigInt(a.balance), right = BigInt(b.balance);

      return left === right ? 0 : (left > right ? 1 : -1) * (sort === 'high' ? -1 : 1);
    });
  const detailBuilding = data.buildings.find((b) => b.id === (buildingId ?? detail));
  const balanceQuery = getMonthRangeQuery(params, month);
  if (selectedAccount)
    balanceQuery.set('account', selectedAccount.id);
  if (selectedBuilding)
    balanceQuery.set('building', selectedBuilding.id);
  const balanceListHref = `/manage/${propertyId}/banking/balances?${balanceQuery}`;
  const {
    closeInitial,
    saved,
    openDetail,
    openPanel,
    editAccount,
    openAccountTransactions,
    closeAccountEditor,
    accountEdited
  } = useBankingBalanceNavigation({
    setAccountDetailId,
    initialAccountId,
    setInitialAccountId,
    params,
    router,
    propertyId,
    cache,
    session,
    setAction,
    panel,
    balanceListHref,
    setNotice,
    balanceQuery,
    setDetail,
    selectedAccount,
    search,
    filter,
    setHistoryAccountId,
    setChartOpen,
    setEditingAccountId,
    month
  });

  const {
    download
  } = useBankingBalanceDownload({
    exportBusyRef: exportBusy,
    data,
    query,
    context,
    setExporting,
    propertyId,
    month,
    startMonth,
    openDownload,
    downloadButton,
    balanceQuery,
    selectedAccount,
    selectedBuilding,
    setNotice
  });

  if (panel) {
    const closePage = () => router.replace(balanceListHref);
    if (panel === 'history')
      return {
        kind: 'history' as const,
        propertyId,
        closePage,
        params,
        accountId
      };
    if (panel === 'initial') {
      const target = data.accounts?.find((row) => row.id === params.get('target'));

      return {
        kind: 'initial' as const,
        propertyId,
        target,
        closePage,
        data,
        saved
      };
    }
    if (panel === 'account')
      return {
        kind: 'account' as const,
        closePage,
        params,
        title,
        accountContent: {
          data,
          userId: session.data?.id,
          propertyId,
          month,
          accountId,
          openPanel,
          onEdit: editAccount,
          onTransactions: openAccountTransactions
        },
        accountEditor: {
          editingAccountId,
          propertyId,
          onClose: closeAccountEditor,
          onSaved: accountEdited
        }
      };
    if (panel === 'chart')
      return {
        kind: 'chart' as const,
        closePage,
        buildings,
        filtered
      };

    return {
      kind: 'operation' as const,
      propertyId,
      panel,
      closePage,
      params,
      action,
      data,
      saved
    };
  }
  if (buildingId)
    return {
      kind: 'ledger' as const,
      propertyId,
      renderReceiptDetail,
      periodLabel,
      data,
      title,
      detailBuilding
    };

  return {
    kind: 'ready' as const,
    propertyId,
    renderReceiptDetail,
    context,
    router,
    params,
    range,
    month,
    startMonth,
    accountId,
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
    setExternalSearch,
    detail,
    setDetail,
    accountDetailId,
    setAccountDetailId,
    editingAccountId,
    historyAccountId,
    setHistoryAccountId,
    initialAccountId,
    chartOpen,
    setChartOpen,
    action,
    setAction,
    notice,
    setNotice,
    exporting,
    downloadButton,
    query,
    data,
    title,
    summary,
    selectedAccount,
    bankBalance,
    bankLabel,
    bankAsOf,
    bankHelp,
    differenceDescription,
    missing,
    buildings,
    selectedBuilding,
    filtered,
    detailBuilding,
    closeInitial,
    saved,
    openDetail,
    openPanel,
    download,
    accountContent: {
      data,
      userId: session.data?.id,
      propertyId,
      month,
      accountId,
      openPanel,
      onEdit: editAccount,
      onTransactions: openAccountTransactions
    },
    accountEditor: {
      editingAccountId,
      propertyId,
      onClose: closeAccountEditor,
      onSaved: accountEdited
    }
  };
}
