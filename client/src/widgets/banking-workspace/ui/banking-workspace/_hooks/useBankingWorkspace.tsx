'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { BankingWorkspaceData } from '../../../api/bankingApiTypes';

import { useBankingSelection } from './useBankingSelection';
import {
  useBankingFilters,
  useBankingUploadDraft,
  useBankingDialogs,
  useBankingFeedback
} from './useBankingWorkspaceState';
import {
  COMMON_BANK_IMPORT_SUPPORT,
  BANKING_DIRECTION_OPTIONS,
  BANKING_PROCESSING_OPTIONS,
  BANKING_VIEW_TITLES,
  BANKING_VIEW_DESCRIPTIONS
} from '../../../constant/bankingOptions';
import { useBankingImport } from './useBankingImport';
import { useBankingDateNavigation } from './useBankingDateNavigation';
import { useBankingExpenseDownload } from './useBankingExpenseDownload';
import { useBankingRowPresentation } from './useBankingRowPresentation';
import { capturePropertyQueryScope } from '@/entities/property';
import {
  getExpenseAccountLabel,
  getBankAccountLabel
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import {
  formatDateRange,
  getMonthDateRange,
  getQueryDateRange,
  isDateInRange
} from '@/shared/lib/date-range';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useEffect,
  type ReactNode
} from 'react';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
import {
  getExpenseAmount,
  sortExpenseLabels
} from '../../../model/expenseAllocation';
import { useReportDownload } from '@/shared/ui/report-download';
import { getAccountsForRange } from '../../../model/bankAccountVisibility';
import {
  getBankingDuplicateIds,
  getBankingReviewRange
} from '../../../model/bankingReview';
/** BankingWorkspace의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBankingWorkspace({
  propertyId,
  view = 'transactions',
  renderReceiptDetail,
  receiptRows = [],
  renderManualRegistration
}: {
  receiptRows?: (BankingTransaction & { source: 'MANUAL' | 'BANK_IMPORT';
deletable: boolean })[];
  renderManualRegistration?: (onClose: () => void, onCreated: (id: string, date: string, transferAccountId?: string) => void) => ReactNode;
  propertyId: string;
  view?: 'transactions' | 'expenses' | 'upload';
  renderReceiptDetail?: (paymentId: string, onClose: () => void, onProcessed: (id: string, status: string) => void) => ReactNode;
}, workspace: UseQueryResult<BankingWorkspaceData, Error>) {

  const {
    openDownload
  } = useReportDownload();
  const session = useSession();
  const propertyScope = capturePropertyQueryScope(session.data?.id, propertyId);
  const cache = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const {
    requestedAccountId,
    setAccountId,
    direction,
    setDirection,
    status,
    setStatus,
    processing,
    setProcessing,
    building,
    setBuilding,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    selection,
    setSelection
  } = useBankingFilters(searchParams);

  const {
    transferRows,
    setTransferRows,
    transferAllocations,
    setTransferAllocations,
    transferAccounts,
    setTransferAccounts,
    preview,
    setPreview,
    file,
    setFile,
    replacingFile,
    setReplacingFile,
    excluded,
    setExcluded,
    expenses,
    setExpenses,
    receipts,
    setReceipts,
    editingId,
    setEditingId
  } = useBankingUploadDraft();

  const {
    transferDetail,
    setTransferDetail,
    deleteOpen,
    setDeleteOpen,
    deleteError,
    setDeleteError,
    manualOpen,
    setManualOpen,
    manualExpenseOpen,
    setManualExpenseOpen,
    detail,
    setDetail
  } = useBankingDialogs();

  const {
    busy,
    setBusy,
    busyRef,
    notice,
    setNotice
  } = useBankingFeedback(view, searchParams);

  // 업로드 뒤 목록에서 성공 알림을 한 번 표시하고 새로고침 시 다시 뜨지 않게 이동 표식을 지웁니다.
  useEffect(() => {
    if (!['transactions', 'expenses'].includes(view) || (searchParams.get('imported') !== '1' && !['1', 'transfer'].includes(searchParams.get('registered') ?? '')))
      return;
    const query = new URLSearchParams(searchParams.toString());
    query.delete('imported');
    query.delete('registered');
    router.replace(`/manage/${propertyId}/banking/${view}${query.size ? `?${query}` : ''}`, {
      scroll: false
    });
  }, [propertyId, router, searchParams, view]);
  const data = workspace.data!;
  const review = view === 'transactions' && ['income', 'expenses', 'duplicates'].includes(searchParams.get('review') ?? '') ? searchParams.get('review') : null;
  const reviewSource = [...(data?.rows ?? []), ...receiptRows];
  const duplicateIds = getBankingDuplicateIds(reviewSource, data?.asOf ?? '');
  // 대시보드의 현재 업무는 실제 후보의 기간만 제시하고 가상의 최솟값이나 현재 월로 과거 업무를 숨기지 않습니다.
  const reviewRows = reviewSource.filter((row) => review === 'duplicates' ? duplicateIds.has(row.id)
    : row.status === 'PENDING' && row.direction === (review === 'expenses' ? 'EXPENSE' : 'INCOME'));
  const dateRange = review && data && !searchParams.has('startDate') && !searchParams.has('month')
    ? getBankingReviewRange(reviewRows, data.asOf) : getQueryDateRange(searchParams, data?.asOf);
  const requestedMonth = dateRange.endDate.slice(0, 7);
  const monthAccounts = view === 'upload' ? data?.accounts ?? [] : getAccountsForRange(data?.accounts ?? [], dateRange);
  const accountId = data && view !== 'upload' && !monthAccounts.some((account) => account.id === requestedAccountId)
    ? 'ALL' : requestedAccountId;
  // 기간과 겹치지 않는 통장은 전체 조회로 복귀하며 사용자가 적용한 날짜는 유지합니다.
  useEffect(() => {
    if (!data || view === 'upload' || accountId === requestedAccountId)
      return;
    const query = new URLSearchParams(searchParams.toString());
    query.delete('account');
    router.replace(`/manage/${propertyId}/banking/${view}?${query}`, {
      scroll: false
    });
  }, [accountId, requestedAccountId, data, requestedMonth, propertyId, router, searchParams, view]);

  /** 같은 오류가 연속 발생해도 새 알림으로 표시하도록 현재 알림 번호를 증가시킵니다. */
  function notify(message: string, tone: 'success' | 'error' = 'error') {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
      tone
    }));
  }

  const currentMonth = dateRange.endDate.slice(0, 7);
  const periodLabel = formatDateRange(dateRange);
  const defaultRange = getMonthDateRange(data.asOf.slice(0, 7));
  const accounts = monthAccounts;
  const visibleAccountIds = new Set(accounts.map((account) => account.id));
  const activeAccountId = accountId === 'ALL' ? accounts.find((account) => account.isPrimary && account.status === 'ACTIVE')?.id : accountId;
  const importAccount = accounts.find((account) => account.id === activeAccountId);
  // 은행 원본 지원 여부는 서버 응답을 사용하며 미지원 통장만 공통 양식으로 가져옵니다.
  const usesCommonTemplate = importAccount?.importSupport?.enabled === false;
  const importSupport = usesCommonTemplate ? COMMON_BANK_IMPORT_SUPPORT : importAccount?.importSupport;
  const canImport = importAccount?.status === 'ACTIVE' && importSupport?.enabled === true;
  const importMessage = importSupport?.message ?? '통장 업로드 지원 정보를 확인할 수 없습니다. 새로고침해주세요.';

  /** 통장 선택·거래·지출 목록에 같은 공통 표시명을 사용합니다. */
  function accountLabel(id: string) {
    const account = accounts.find((row) => row.id === id);

    return account ? getBankAccountLabel(account) : '관리계좌';
  }

  const buildings = sortExpenseLabels(data.buildings);
  const receiptById = new Map(receiptRows.map((row) => [row.id, row]));
  const manualIds = new Set(receiptRows.filter((row) => row.source === 'MANUAL').map((row) => row.id));
  const receiptIds = new Set(receiptById.keys());

  /** 은행 원본과 미연결 수동 수납을 선택 삭제하며 확정 수납의 취소는 서버에서 함께 처리합니다. */
  function canDelete(row: BankingTransaction) {
    if (row.status === 'TRANSFER' || row.expense?.accountCode === '103'
      || data?.deletionGroups?.some((group) => group.requiresCancellation && group.transactionIds.includes(row.id)))
      return false;
    if (row.sourceType === 'MANUAL' && row.direction === 'EXPENSE')
      return true;

    return receiptById.get(row.id)?.deletable ?? !receiptIds.has(row.id);
  }

  // 수동 수납은 은행 원본을 만들지 않으며 연결 전 항목만 함께 표시합니다. 연결되면 은행 행 하나로 남습니다.
  const source = preview?.rows ?? (view === 'upload' ? [] : [...data.rows, ...(view === 'transactions' ? receiptRows : [])]
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`)));
  const baseRows = source.filter((row) => (preview || isDateInRange(row.date, dateRange))
    && (preview || review !== 'duplicates' || duplicateIds.has(row.id))
    && (preview || !data.accounts?.length || visibleAccountIds.has(row.accountId))
    && (preview || accountId === 'ALL' || row.accountId === accountId)
    && (view !== 'expenses' || row.expense?.allocations.some((part) => data.buildings.some((item) => item.id === part.buildingId)))
    && (status === 'ALL' || (status === 'CONFIRMED' && ['CONFIRMED', 'LINKED', 'TRANSFER'].includes(row.status)) || (status === 'PENDING' && ['PENDING', 'TRANSFER_PENDING'].includes(row.status)) || (status === 'ON_HOLD' && row.status === 'ON_HOLD'))
    && (view !== 'expenses' || building === 'ALL' || row.expense?.allocations.some((a) => a.buildingId === building))
    && `${row.payer} ${row.memo ?? ''} ${row.unitLabel} ${row.expense?.category ?? ''} ${row.expense?.note ?? ''} ${row.transferCandidate || (preview && transferRows.includes(row.id)) ? '계좌 이체' : getExpenseAccountLabel(row.expense)}`.includes(search.trim()));
  // 조회 월·통장·검색·상태 조건이 적용된 빈 결과는 등록 자료 자체가 없는 상태와 구분합니다.
  const hasFilters = Boolean(review || search.trim() || accountId !== 'ALL' || direction !== 'ALL' || status !== 'ALL'
    || (preview && processing !== 'ALL')
    || (view === 'expenses' && building !== 'ALL') || dateRange.startDate !== defaultRange.startDate || dateRange.endDate !== defaultRange.endDate);
  // 과거 월·다른 목록 범위에 원본이 있으면 미등록으로 안내하지 않고 현재 조건의 빈 결과로 표시합니다.
  const showNoResults = hasFilters || source.length > 0;
  const activeRows = baseRows.filter((row) => preview || row.status !== 'CANCELED');
  const directionRows = direction === 'CANCELED' ? baseRows.filter((row) => row.status === 'CANCELED') : activeRows.filter((row) => direction === 'ALL' || row.direction === direction);
  const {
    expenseDraft,
    receiptDraft,
    processingContent,
    canTransfer,
    editor
  } = useBankingRowPresentation({
    expenses,
    data,
    receipts,
    preview,
    transferRows,
    buildings,
    busy,
    setReceipts,
    setNotice,
    setExpenses
  });

  // 표와 같은 분류 결과로 건수·필터를 계산하고 파일 전체의 선택·초안은 건드리지 않습니다.
  const processingKinds = preview ? directionRows.map((row) => processingContent(row).kind) : [];
  const processingOptions = BANKING_PROCESSING_OPTIONS.filter(option => !(direction === 'EXPENSE' && ['UNCLASSIFIED', 'HOUSEHOLD', 'SHARED', 'OTHER'].includes(option.value)) && !(direction === 'INCOME' && option.value === 'EXPENSE')).map(option => ({
    ...option,
    label: `${option.label} (${option.value === 'ALL' ? directionRows.length : processingKinds.filter(kind => kind === option.value).length})`
  }));
  const filtered = preview && processing !== 'ALL'
    ? directionRows.filter((row) => processingContent(row).kind === processing) : directionRows;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectionScope = JSON.stringify([propertyId, accountId, dateRange.startDate, dateRange.endDate, direction, status, review, search, pageSize, currentPage]);
  const isSelecting = view === 'transactions' && !preview && selection?.scope === selectionScope;
  const selectableRows = visible.filter(canDelete);
  // 삭제 범위는 화면 필터와 분리해 다른 통장·페이지에 있는 상대 거래도 확인창과 요청에 포함합니다.
  const allDeletionRows = [...data.rows, ...receiptRows];
  const deletingRows = isSelecting ? allDeletionRows.filter((row) => selection.ids.includes(row.id)) : [];

  function linkedDeletionIds(ids: string[]) {
    const result = new Set(ids);
    for (const group of data?.deletionGroups ?? []) {
      if (!group.requiresCancellation && group.transactionIds.some((id) => result.has(id))) {
        group.transactionIds.forEach((id) => result.add(id));
      }
    }

    return [...result];
  }

  const selected = preview?.rows.filter((row) => !excluded.includes(row.id)) ?? [];
  const selectedIncome = selected.filter((row) => row.direction === 'INCOME').length;
  // 미리보기 합계는 검색·페이지·저장 선택과 무관하게 가져올 수 있는 거래 전체를 기준으로 계산합니다.
  // 수동 입금도 합산하되 취소 이력 행은 제외합니다. 은행에 연결된 수동 입금은 원본 행만 남아 한 번 집계됩니다.
  const summaryRows = (preview?.rows ?? baseRows).filter((row) => !(row.automaticTransfer && row.status === 'CANCELED'));
  const income = summaryRows.filter((row) => row.direction === 'INCOME'
    && (preview || !receiptIds.has(row.id) || (manualIds.has(row.id) && row.status !== 'CANCELED')))
    .reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const expense = summaryRows.filter((row) => row.direction === 'EXPENSE').reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const netAmount = income - expense;
  const summaryDescription = preview ? '중복·인계 이전 제외 후 전체 거래 기준' : `${periodLabel} 등록된 은행 거래·수동 입출금 기준`;
  const expenseBuildings = buildings.filter((item) => building === 'ALL' || item.id === building);
  const expenseBuildingIds = expenseBuildings.map((item) => item.id);
  const buildingExpense = baseRows.reduce((sum, row) => sum + getExpenseAmount(row, expenseBuildingIds), BigInt(0));
  const showIncome = view !== 'expenses' && direction !== 'EXPENSE';
  const showExpense = view !== 'expenses' && direction !== 'INCOME' && direction !== 'CANCELED';
  // 필터와 조회 통장에 따라 실제로 보이는 카드 수로 열을 맞춰 빈 칸을 남기지 않습니다.
  const summaryColumns = Number(Boolean(preview) || showIncome)
    + Number(Boolean(preview) || showExpense || view === 'expenses')
    + (view === 'expenses' ? 0 : 2);
  const searchPlaceholder = [showIncome && '입금자', (showExpense || view === 'expenses') && '지출명', showIncome && '세대'].filter(Boolean).join('·') + ' 검색';

  const title = view === 'upload' && preview ? '업로드 미리보기' : BANKING_VIEW_TITLES[view];
  const description = BANKING_VIEW_DESCRIPTIONS[view];
  const {
    downloadExpenses
  } = useBankingExpenseDownload({
    baseRows,
    expenseBuildingIds,
    dateRange,
    building,
    expenseBuildings,
    search,
    openDownload,
    propertyId,
    searchParams,
    currentMonth
  });

  const {
    changeDateRange,
    changeMonth
  } = useBankingDateNavigation({
    setSelection,
    setPage,
    searchParams,
    data,
    accountId,
    setAccountId,
    router,
    propertyId,
    view
  });

  const {
    readFile,
    resetUpload,
    commit
  } = useBankingImport({
    busyRef,
    accountId,
    workspace,
    notify,
    setBusy,
    propertyId,
    setTransferRows,
    setTransferAllocations,
    setTransferAccounts,
    setFile,
    setPreview,
    setExcluded,
    setExpenses,
    setReceipts,
    setEditingId,
    setReplacingFile,
    setDirection,
    setStatus,
    setProcessing,
    setSearch,
    setPage,
    file,
    preview,
    selected,
    canImport,
    transferRows,
    transferAccounts,
    transferAllocations,
    buildings,
    expenseDraft,
    pageSize,
    receiptDraft,
    cache,
    activeAccountId,
    queryKey,
    propertyScope,
    session,
    router,
    data
  });

  const directionTabs = BANKING_DIRECTION_OPTIONS.filter(option => option.value !== 'CANCELED' || (view === 'transactions' && !preview)).map(option => ({
    ...option,
    count: option.value === 'ALL' ? activeRows.length : option.value === 'CANCELED' ? baseRows.filter(row => row.status === 'CANCELED').length : activeRows.filter(row => row.direction === option.value).length
  }));
  const {
    toggleDeletion,
    removeSelected
  } = useBankingSelection({
    busyRef,
    visible,
    canDelete,
    setSelection,
    selectionScope,
    deletingRows,
    linkedDeletionIds,
    setBusy,
    setDeleteError,
    cache,
    propertyId,
    receiptIds,
    queryKey,
    propertyScope,
    session,
    setDeleteOpen,
    setPage,
    notify
  });

  return {
    controls: {
      propertyId,
      view,
      renderManualRegistration,
      router,
      searchParams,
      setAccountId,
      setDirection,
      setStatus,
      setPage,
      preview,
      file,
      replacingFile,
      setReplacingFile,
      setSelection,
      setManualOpen,
      setManualExpenseOpen,
      busy,
      review,
      accountId,
      readFile,
      currentMonth,
      accounts,
      activeAccountId,
      importAccount,
      importSupport,
      usesCommonTemplate,
      canImport,
      importMessage,
      accountLabel,
      baseRows,
      downloadExpenses,
      resetUpload,
      title,
      description
    },
    results: {
      propertyId,
      view,
      router,
      searchParams,
      setAccountId,
      transferRows,
      setTransferDetail,
      direction,
      setDirection,
      status,
      setStatus,
      processing,
      setProcessing,
      building,
      setBuilding,
      search,
      setSearch,
      setPage,
      pageSize,
      setPageSize,
      preview,
      excluded,
      setExcluded,
      setEditingId,
      setSelection,
      setDeleteOpen,
      setDeleteError,
      setDetail,
      busy,
      data,
      dateRange,
      accountId,
      notify,
      currentMonth,
      periodLabel,
      accounts,
      accountLabel,
      buildings,
      canDelete,
      baseRows,
      showNoResults,
      processingOptions,
      filtered,
      currentPage,
      visible,
      selectionScope,
      isSelecting,
      selectableRows,
      deletingRows,
      linkedDeletionIds,
      toggleDeletion,
      changeDateRange,
      income,
      expense,
      netAmount,
      summaryDescription,
      expenseBuildingIds,
      buildingExpense,
      showIncome,
      showExpense,
      directionTabs,
      summaryColumns,
      searchPlaceholder,
      expenseDraft,
      processingContent
    },
    importSettings: {
      propertyId,
      transferRows,
      setTransferRows,
      transferAllocations,
      setTransferAllocations,
      transferAccounts,
      setTransferAccounts,
      preview,
      editingId,
      setEditingId,
      busy,
      data,
      accounts,
      buildings,
      expenseDraft,
      canTransfer,
      editor
    },
    dialogs: {
      propertyId,
      renderReceiptDetail,
      renderManualRegistration,
      router,
      setAccountId,
      transferDetail,
      setTransferDetail,
      setDirection,
      setStatus,
      setBuilding,
      setSearch,
      setPage,
      setSelection,
      deleteOpen,
      setDeleteOpen,
      deleteError,
      manualOpen,
      setManualOpen,
      manualExpenseOpen,
      setManualExpenseOpen,
      detail,
      setDetail,
      busy,
      data,
      notify,
      activeAccountId,
      deletingRows,
      changeMonth,
      removeSelected
    },
    preview,
    selected,
    selectedIncome,
    busy,
    commit,
    notice,
    closeNotice: () => setNotice(null)
  };
}
