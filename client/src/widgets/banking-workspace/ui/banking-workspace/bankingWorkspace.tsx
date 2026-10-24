'use client';

import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { AllocationEditor } from '@/entities/banking';
import { useSession } from '@/entities/session';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { Toast } from '@/shared/ui/toast';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  bankingError,
  deleteBankingTransactions,
  getBankingWorkspace,
  importBankingFile,
  previewBankingFile
} from '../../api/bankingApi';
import type {
  BankingPreview,
  BankingSelection,
  BankingTransaction,
  ExpenseDraft
} from '../../api/bankingApiTypes';
import {
  calculateExpenseAllocation,
  createExpenseDraft,
  getExpenseAmount,
  sortExpenseLabels
} from '../../model/expenseAllocation';
import { createExpenseWorkbook } from '../../model/expenseExport';
import { getAccountsForMonth } from '../../model/bankAccountVisibility';
import { BankImportActions } from '../_components/bank-import-actions/bankImportActions';
import { TransferDetail } from '../_components/transfer-detail/transferDetail';
import { BankingExpensePage } from '../banking-expense-page/bankingExpensePage';
import { ManualExpense } from '../manual-expense/manualExpense';
import styles from './bankingWorkspace.module.css';

type ReceiptDraft = { kind: 'AUTO' | 'HOUSEHOLD' | 'OTHER' | 'SHARED'; unitId: string; category: string; note: string };

/** 필터·페이지를 바꿔도 파일 전체의 선택·분류 초안을 유지하고 실제 저장은 서버 원본 재검증으로 처리합니다. */
export function BankingWorkspace({ propertyId, view = 'transactions', renderReceiptDetail, receiptRows = [], renderManualRegistration }: {
  receiptRows?: (BankingTransaction & { source: 'MANUAL' | 'BANK_IMPORT'; deletable: boolean })[];
  renderManualRegistration?: (onClose: () => void, onCreated: (id: string, date: string) => void) => ReactNode;
  propertyId: string;
  view?: 'transactions' | 'expenses' | 'upload';
  renderReceiptDetail?: (paymentId: string, onClose: () => void, onProcessed: (id: string, status: string) => void) => ReactNode;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const workspace = useQuery({
    queryKey,
    queryFn: () => getBankingWorkspace(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [month, setMonth] = useState<string | null>(() => {
    const requested = searchParams.get('month');
    return requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : null;
  });
  const [requestedAccountId, setAccountId] = useState(() => searchParams.get('account') ?? 'ALL');
  const [transferRows, setTransferRows] = useState<string[]>([]);
  const [transferDetail, setTransferDetail] = useState<BankingTransaction | null>(null);
  const [direction, setDirection] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [building, setBuilding] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [preview, setPreview] = useState<BankingPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replacingFile, setReplacingFile] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Record<string, ExpenseDraft>>({});
  const [receipts, setReceipts] = useState<Record<string, ReceiptDraft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ scope: string; ids: string[] } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualExpenseOpen, setManualExpenseOpen] = useState(false);
  const [detail, setDetail] = useState<{ id: string; kind: 'receipt' | 'expense' } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const exportBusyRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ id: number; message: string; tone: 'success' | 'error' } | null>(() => (
    (view === 'transactions' && searchParams.get('imported') === '1') || (view === 'transactions' && searchParams.get('registered') === '1') ? {
      id: 0,
      message: searchParams.get('registered') === '1' ? '지출을 등록했어요.' : '선택한 거래를 저장했어요.',
      tone: 'success'
    } : null
  ));
  // 업로드 뒤 목록에서 성공 알림을 한 번 표시하고 새로고침 시 다시 뜨지 않게 이동 표식을 지웁니다.
  useEffect(() => {
    if (!['transactions', 'expenses'].includes(view) || (searchParams.get('imported') !== '1' && searchParams.get('registered') !== '1')) return;
    const query = new URLSearchParams(searchParams.toString());
    query.delete('imported');
    query.delete('registered');
    router.replace(`/manage/${propertyId}/banking/${view}${query.size ? `?${query}` : ''}`, {
      scroll: false
    });
  }, [propertyId, router, searchParams, view]);
  const data = workspace.data;
  const requestedMonth = month ?? data?.asOf.slice(0, 7) ?? '';
  const monthAccounts = view === 'upload' ? data?.accounts ?? [] : getAccountsForMonth(data?.accounts ?? [], requestedMonth);
  const accountId = data && view !== 'upload' && !monthAccounts.some((account) => account.id === requestedAccountId)
    ? 'ALL' : requestedAccountId;
  // 월을 바꿔 숨겨진 종료 통장이 선택돼 있으면 해당 월 전체 통장으로 복귀하고 URL도 함께 정리합니다.
  useEffect(() => {
    if (!data || view === 'upload' || accountId === requestedAccountId) return;
    const query = new URLSearchParams(searchParams.toString());
    query.set('month', requestedMonth);
    query.delete('account');
    router.replace(`/manage/${propertyId}/banking/${view}?${query}`, {
      scroll: false
    });
  }, [accountId, requestedAccountId, data, requestedMonth, propertyId, router, searchParams, view]);
  /** 같은 오류가 연속 발생해도 새 알림으로 표시하도록 현재 알림 번호를 증가시킵니다. */
  function notify(message: string, tone: 'success' | 'error' = 'error') { setNotice((current) => ({
    id: (current?.id ?? 0) + 1,
    message,
    tone
  })); }

  /** 새 파일 검증이 성공한 경우에만 기존 선택·초안을 교체하고 실패하면 재시도 상태를 보존합니다. */
  async function readFile(next: File) {
    if (busyRef.current) return;
    const selectedAccount = accountId === 'ALL'
      ? workspace.data?.accounts?.find((account) => account.isPrimary && account.status === 'ACTIVE')
      : workspace.data?.accounts?.find((account) => account.id === accountId);
    if (selectedAccount?.status !== 'ACTIVE' || !selectedAccount.importSupport?.enabled) {
      notify('선택한 통장의 업로드 지원 정보를 확인해주세요.');
      return;
    }
    if (!selectedAccount.importSupport.extensions.some((extension) => next.name.toLowerCase().endsWith(extension))) {
      notify(selectedAccount.importSupport.message);
      return;
    }
    busyRef.current = true; setBusy(true);
    try {
      const result = await previewBankingFile(propertyId, next, selectedAccount.id);
      if (result.rows.some((row) => row.accountId !== selectedAccount.id)) throw new Error('계좌가 일치하지 않습니다.');
      setTransferRows([]);
      setFile(next); setPreview(result); setExcluded([]); setExpenses({}); setReceipts({}); setEditingId(null);
      setReplacingFile(false);
      setDirection('ALL'); setStatus('ALL'); setSearch(''); setPage(1);
    } catch (error) { notify(bankingError(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (workspace.isPending) return (
    <LoadingState
      title={'통장 정보를 불러오고 있어요.'}
    />
  );
  if (!data) return (
    <RequestError
      error={workspace.error}
      onRetry={() => void workspace.refetch({
        cancelRefetch: false
      })}
    />
  );
  const currentMonth = month ?? data.asOf.slice(0, 7);
  const accounts = monthAccounts;
  const visibleAccountIds = new Set(accounts.map((account) => account.id));
  const activeAccountId = accountId === 'ALL' ? accounts.find((account) => account.isPrimary && account.status === 'ACTIVE')?.id : accountId;
  const importAccount = accounts.find((account) => account.id === activeAccountId);
  const importSupport = importAccount?.importSupport;
  const canImport = importAccount?.status === 'ACTIVE' && importSupport?.enabled === true;
  const importMessage = importSupport?.message ?? '통장 업로드 지원 정보를 확인할 수 없습니다. 새로고침해주세요.';
  function accountLabel(id: string) {
    const account = accounts.find((row) => row.id === id);
    return account ? `${account.bankName} ····${account.last4}${account.alias ? ` · ${account.alias}` : ''}${account.status === 'ACTIVE' ? '' : ' · 사용 종료'}` : '관리계좌';
  }
  const buildings = sortExpenseLabels(data.buildings);
  const receiptById = new Map(receiptRows.map((row) => [row.id, row]));
  const manualIds = new Set(receiptRows.filter((row) => row.source === 'MANUAL').map((row) => row.id));
  const receiptIds = new Set(receiptById.keys());
  /** 은행 원본과 미연결 수동 수납을 선택 삭제하며 확정 수납의 취소는 서버에서 함께 처리합니다. */
  function canDelete(row: BankingTransaction) {
    return row.sourceType !== 'MANUAL' && (receiptById.get(row.id)?.deletable ?? !receiptIds.has(row.id));
  }
  // 수동 수납은 은행 원본을 만들지 않으며 연결 전 항목만 함께 표시합니다. 연결되면 은행 행 하나로 남습니다.
  const source = preview?.rows ?? (view === 'upload' ? [] : [...data.rows, ...(view === 'transactions' ? receiptRows : [])]
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`)));
  const baseRows = source.filter((row) => (preview || row.date.startsWith(currentMonth))
    && (preview || !data.accounts?.length || visibleAccountIds.has(row.accountId))
    && (preview || accountId === 'ALL' || row.accountId === accountId)
    && (view !== 'expenses' || row.expense?.allocations.some((part) => data.buildings.some((item) => item.id === part.buildingId)))
    && (status === 'ALL' || row.status === status)
    && (view !== 'expenses' || building === 'ALL' || row.expense?.allocations.some((a) => a.buildingId === building))
    && `${row.payer} ${row.memo ?? ''} ${row.unitLabel} ${row.expense?.category ?? ''} ${row.expense?.note ?? ''}`.includes(search.trim()));
  // 조회 월·통장·검색·상태 조건이 적용된 빈 결과는 등록 자료 자체가 없는 상태와 구분합니다.
  const hasFilters = Boolean(search.trim() || accountId !== 'ALL' || direction !== 'ALL' || status !== 'ALL'
    || (view === 'expenses' && building !== 'ALL') || currentMonth !== data.asOf.slice(0, 7));
  // 과거 월·다른 목록 범위에 원본이 있으면 미등록으로 안내하지 않고 현재 조건의 빈 결과로 표시합니다.
  const showNoResults = hasFilters || source.length > 0;
  const activeRows = baseRows.filter((row) => row.status !== 'CANCELED');
  const filtered = direction === 'CANCELED' ? baseRows.filter((row) => row.status === 'CANCELED') : activeRows.filter((row) => direction === 'ALL' || row.direction === direction);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectionScope = JSON.stringify([propertyId, accountId, currentMonth, direction, status, search, pageSize, currentPage]);
  const isSelecting = view === 'transactions' && !preview && selection?.scope === selectionScope;
  const selectableRows = visible.filter(canDelete);
  const deletingRows = isSelecting ? selectableRows.filter((row) => selection.ids.includes(row.id)) : [];
  function toggleDeletion(id: string) {
    if (busyRef.current || !visible.some((row) => row.id === id && canDelete(row))) return;
    setSelection({
      scope: selectionScope,
      ids: deletingRows.some((row) => row.id === id)
        ? deletingRows.filter((row) => row.id !== id).map((row) => row.id) : [...deletingRows.map((row) => row.id), id]
    });
  }
  /** 조회 월을 주소에도 보존해 수동 등록 뒤 새로고침이 이전 월로 되돌아가지 않게 합니다. */
  function changeMonth(value: string) {
    setSelection(null); setMonth(value); setPage(1);
    if (!['transactions', 'expenses'].includes(view)) return;
    const query = new URLSearchParams(searchParams.toString());
    query.set('month', value);
    const nextAccount = getAccountsForMonth(data?.accounts ?? [], value).some((account) => account.id === accountId) ? accountId : 'ALL';
    setAccountId(nextAccount);
    if (nextAccount === 'ALL') query.delete('account');
    else query.set('account', nextAccount);
    query.delete('imported');
    router.replace(`/manage/${propertyId}/banking/${view}?${query}`, {
      scroll: false
    });
  }
  /** 선택 전체가 저장된 뒤 목록·수납·잔고를 갱신하며 실패 시 선택과 확인창을 유지합니다. */
  async function removeSelected() {
    if (busyRef.current || !deletingRows.length) return;
    busyRef.current = true; setBusy(true); setDeleteError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await deleteBankingTransactions(propertyId, deletingRows.filter((row) => !receiptIds.has(row.id)).map((row) => row.id), deletingRows.filter((row) => receiptIds.has(row.id)).map((row) => row.paymentId!));
      cache.setQueryData(queryKey, saved);
      await Promise.all(['payment-workspace', 'banking-balances', 'billing'].map((key) => cache.invalidateQueries({
        queryKey: [key, session.data?.id, propertyId]
      })));
      setDeleteOpen(false); setSelection(null); setPage(1);
      notify('선택한 거래를 삭제했어요.', 'success');
    } catch (error) { setDeleteError(bankingError(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const selected = preview?.rows.filter((row) => !excluded.includes(row.id)) ?? [];
  const selectedIncome = selected.filter((row) => row.direction === 'INCOME').length;
  // 미리보기 합계는 검색·페이지·저장 선택과 무관하게 가져올 수 있는 거래 전체를 기준으로 계산합니다.
  // 수동 입금도 합산하되 취소 이력 행은 제외합니다. 은행에 연결된 수동 입금은 원본 행만 남아 한 번 집계됩니다.
  const summaryRows = preview?.rows ?? baseRows;
  const income = summaryRows.filter((row) => row.direction === 'INCOME'
    && (preview || !receiptIds.has(row.id) || (manualIds.has(row.id) && row.status !== 'CANCELED')))
    .reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const expense = summaryRows.filter((row) => row.direction === 'EXPENSE').reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const netAmount = income - expense;
  const summaryDescription = preview ? '중복·인계 이전 제외 후 전체 거래 기준' : `${currentMonth} 은행 거래·취소되지 않은 수동 입출금 기준`;
  const expenseBuildings = buildings.filter((item) => building === 'ALL' || item.id === building);
  const expenseBuildingIds = expenseBuildings.map((item) => item.id);
  const buildingExpense = baseRows.reduce((sum, row) => sum + getExpenseAmount(row, expenseBuildingIds), BigInt(0));
  const showIncome = view !== 'expenses' && direction !== 'EXPENSE';
  const showExpense = view !== 'expenses' && direction !== 'INCOME' && direction !== 'CANCELED';
  const searchPlaceholder = [showIncome && '입금자', (showExpense || view === 'expenses') && '지출명', showIncome && '세대'].filter(Boolean).join('·') + ' 검색';

  /** 현재 월·동·검색에 맞는 전체 결과를 다운로드하며 페이지·표시 개수로 파일 범위를 줄이지 않습니다. */
  async function downloadExpenses() {
    if (exportBusyRef.current || !baseRows.length) return;
    exportBusyRef.current = true; setExporting(true);
    try {
      const blob = await createExpenseWorkbook(baseRows, expenseBuildingIds, {
        month: currentMonth,
        buildingLabel: building === 'ALL' ? '전체 동' : expenseBuildings.map((item) => item.label).join(' · '),
        search: search.trim()
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `모아홈_지출내역_${currentMonth}_${building === 'ALL' ? '전체동' : '선택동'}.xlsx`;
      try { anchor.click(); }
      finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { notify('엑셀 파일을 만들지 못했어요. 다시 시도해주세요.'); }
    finally { exportBusyRef.current = false; setExporting(false); }
  }
  const latestRows = [...data.rows].filter((row) => row.sourceType !== 'MANUAL' && row.accountId === accountId && row.date.slice(0, 7) <= currentMonth)
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
  const lastRaw = latestRows[0];
  const lastDay = latestRows.filter((row) => row.date === lastRaw?.date);
  const ambiguous = lastDay.length > 1 && (lastDay.some((row) => row.time === null)
    || new Set(lastDay.filter((row) => row.time === lastRaw.time).map((row) => row.balance)).size > 1);
  const latest = !ambiguous && lastRaw?.balance !== null ? lastRaw : undefined;
  let latestValue = '은행 확인 자료 없음';
  let latestDescription: string | undefined;
  if (accountId === 'ALL') {
    latestValue = '통장별 확인';
  } else if (latest) {
    latestValue = formatInteger(latest.balance!);
    latestDescription = `${latest.date} ${latest.time ?? ''} 거래 후`;
  } else if (ambiguous) {
    latestValue = '거래 순서 미확인';
  }

  function expenseDraft(row: BankingTransaction) { return expenses[row.id] ?? createExpenseDraft(row, data!); }
  function receiptDraft(row: BankingTransaction): ReceiptDraft { return receipts[row.id] ?? {
    kind: 'AUTO',
    unitId: row.unitId,
    category: '',
    note: ''
  }; }
  /** 처리 종류와 연결 대상을 구분하고, 공동 입금은 동 이름 대신 개수로 요약합니다. */
  function processingContent(row: BankingTransaction): {
    title: string;
    detail?: string;
  } {
    if (row.transferCandidate || (preview && transferRows.includes(row.id))) return {
      title: '계좌 간 이체',
      detail: row.transferId ? '연결 완료' : '상대 통장 연결 대기'
    };
    if (row.status === 'CANCELED') return {
      title: '취소된 수납',
      detail: row.unitLabel
    };
    if (row.direction === 'EXPENSE') {
      const draft = preview ? expenseDraft(row) : row.expense;
      // 기존 기준대로 외부로 지정한 동도 부담 동 개수에 포함합니다.
      const count = new Set(draft?.allocations.filter((part) => part.label.trim()).map((part) => part.buildingId ?? `external:${part.label.trim()}`)).size;

      return {
        title: '지출',
        detail: count ? `${count}동 부담` : '부담 동 확인 필요'
      };
    }

    const draft = preview ? receiptDraft(row) : null;
    const allocation = draft?.kind === 'SHARED' ? expenseDraft(row) : row.incomeAllocation;
    if (allocation) return {
      title: '동별 입금',
      detail: allocation.allocations.length ? `${allocation.allocations.length}개 동 배분${preview ? ' 예정' : ''}` : '배분 동 확인 필요'
    };
    if (draft?.kind === 'OTHER' || row.receiptType === 'OTHER') return {
      title: '기타 입금',
      detail: !preview && 'source' in row && row.source === 'MANUAL' ? row.unitLabel : undefined
    };

    const unitId = draft?.kind === 'HOUSEHOLD' ? draft.unitId : row.unitId;
    const unitLabel = data?.units.find((unit) => unit.id === unitId)?.label || (!preview && row.unitLabel);
    if (!unitLabel) return {
      title: '입금 분류 필요'
    };
    // 미리보기와 미확정 후보를 실제 수납이 완료된 세대로 표시하지 않습니다.
    if (preview) return {
      title: '세대 수납 예정',
      detail: unitLabel
    };

    return {
      title: ['CONFIRMED', 'LINKED'].includes(row.status) ? '세대 수납' : '세대 확인 필요',
      detail: unitLabel
    };
  }
  /** 저장 전 거래 설정은 공통 모달에서 편집하고 닫아도 파일별 초안을 보존합니다. */
  function previewEditor(row: BankingTransaction) {
    if (!data) return null;
    return row.direction === 'EXPENSE' ? (
      <AllocationEditor
        total={row.amount}
        draft={expenseDraft(row)}
        buildings={buildings}
        disabled={busy}
        onChange={(draft) => {
          setNotice(null);
          setExpenses((current) => ({
            ...current,
            [row.id]: draft
          }));
        }}
      />
    ) : (() => {
      const draft = receiptDraft(row);
      function change(patch: Partial<ReceiptDraft>) { setReceipts((current) => ({
        ...current,
        [row.id]: {
          ...draft,
          ...patch
        }
      })); }
      return (
        <fieldset
          className={styles['receipt-editor']}
          disabled={busy}
        >
          <legend>
            입금 분류
          </legend>
          <Dropdown
            label={'입금 용도'}
            disabled={busy}
            value={draft.kind}
            onChange={(value) => change({
              kind: value as ReceiptDraft['kind']
            })}
            options={[{
              value: 'AUTO',
              label: '명단 일치 자동 수납 · 미일치는 확인 필요'
            }, {
              value: 'HOUSEHOLD',
              label: '세대 관리비 직접 지정'
            }, {
              value: 'OTHER',
              label: '외부 분담금·수리비 등 기타 입금'
            }, {
              value: 'SHARED',
              label: '동별 입금 · 직접 배분'
            }]}
          />
          {draft.kind === 'AUTO' && (
            <p>
              {data.units.find((u) => u.id === row.unitId)?.label ?? '일치하는 세대가 없어 가져온 뒤 확인이 필요합니다.'}
            </p>
          )}
          {draft.kind === 'HOUSEHOLD' && (
            <Dropdown
              label={'수납 세대'}
              disabled={busy}
              value={draft.unitId}
              onChange={(value) => change({
                unitId: value
              })}
              options={data.units.map((u) => ({
                value: u.id,
                label: u.label
              }))}
            />
          )}
          {draft.kind === 'SHARED' && (
            <AllocationEditor
              purpose={'income'}
              total={row.amount}
              draft={expenseDraft(row)}
              buildings={buildings}
              disabled={busy}
              onChange={(next) => setExpenses((current) => ({
                ...current,
                [row.id]: next
              }))}
            />
          )}
          {draft.kind === 'OTHER' && (
            <>
              <Input
                label={'기타 입금 항목'}
                maxLength={100}
                value={draft.category}
                onChange={(event) => change({
                  category: event.target.value
                })}
              />
              <Input
                label={'입금 메모'}
                maxLength={500}
                value={draft.note}
                onChange={(event) => change({
                  note: event.target.value
                })}
              />
            </>
          )}
        </fieldset>
      );
    })();
  }
  function resetUpload() {
    setReplacingFile(false);
    setTransferRows([]);setPreview(null); setFile(null); setExcluded([]); setExpenses({}); setReceipts({}); setEditingId(null); setPage(1); setDirection('ALL');
  }
  /** 서로 다른 필터에서 고른 입출금도 하나의 요청으로 보내고 실패 시 초안 전체를 보존합니다. */
  async function commit() {
    if (!file || !preview || !selected.length || busyRef.current || !canImport) return;
    const rows: BankingSelection[] = [];
    for (const row of selected) {
      if (transferRows.includes(row.id)) { rows.push({
        id: row.id,
        transfer: true
      });continue; }
      if (row.direction === 'EXPENSE') {
        const draft = expenseDraft(row);
        const result = calculateExpenseAllocation(row.amount, draft);
        if (result.error) { setDirection('EXPENSE'); setSearch(''); setStatus('ALL'); setPage(Math.floor(preview.rows.filter((r) => r.direction === 'EXPENSE').findIndex((r) => r.id === row.id) / pageSize) + 1); setEditingId(row.id); notify(`${row.payer}: ${result.error}`); return; }
        rows.push({
          id: row.id,
          expense: {
            ...draft,
            allocations: result.allocations
          }
        }); continue;
      }
      const draft = receiptDraft(row);
      if ((draft.kind === 'HOUSEHOLD' && !draft.unitId) || (draft.kind === 'OTHER' && !draft.category.trim())) {
        setDirection('INCOME'); setEditingId(row.id); notify('입금의 세대 또는 기타 입금 항목을 지정해주세요.'); return;
      }
      if (draft.kind === 'SHARED') {
        const allocation = expenseDraft(row);
        const calculated = calculateExpenseAllocation(row.amount, allocation, 'income');
        if (calculated.error) { setDirection('INCOME'); setEditingId(row.id); notify(calculated.error); return; }
        rows.push({
          id: row.id,
          incomeCategory: allocation.category.trim(),
          incomeNote: allocation.note.trim() || undefined,
          incomeAllocation: {
            ...allocation,
            saveAsRule: false,
            allocations: calculated.allocations
          }
        });
        continue;
      }
      rows.push({
        id: row.id,
        ...(draft.kind === 'HOUSEHOLD' ? {
          unitId: draft.unitId
        } : {}),
        ...(draft.kind === 'OTHER' ? {
          incomeCategory: draft.category.trim(),
          ...(draft.note.trim() ? {
            incomeNote: draft.note.trim()
          } : {})
        } : {})
      });
    }
    busyRef.current = true; setBusy(true);
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await importBankingFile(propertyId, file, rows, preview.rows[0]?.accountId ?? activeAccountId);
      cache.setQueryData(queryKey, saved);
      void cache.invalidateQueries({
        queryKey: ['payment-workspace', session.data?.id, propertyId]
      });
      void cache.invalidateQueries({
        queryKey: ['billing', session.data?.id, propertyId]
      });
      const importedMonth = selected[0].date.slice(0, 7);
      setMonth(importedMonth); resetUpload();
      router.push(`/manage/${propertyId}/banking/transactions?imported=1${importedMonth === data!.asOf.slice(0, 7) ? '' : `&month=${importedMonth}`}`);
    } catch (error) { notify(bankingError(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const title = {
    transactions: '통장 거래',
    expenses: '지출 내역',
    upload: preview ? '업로드 미리보기' : '거래내역 가져오기'
  }[view];
  const description = {
    transactions: '통장 거래를 확인하고 입금은 세대에, 출금은 각 동에 연결합니다.',
    expenses: '각 동에서 부담한 지출을 확인합니다.',
    upload: '은행 거래 파일을 확인한 뒤 선택한 거래를 저장합니다.'
  }[view];
  return (
    <section
      className={styles.page}
      aria-labelledby={'banking-title'}
    >
      <ListHeader
        className={styles.header}
        actionsClassName={view === 'upload' ? styles['upload-actions'] : styles['header-actions']}
        menu={'통장 관리'}
        title={title}
        titleId={'banking-title'}
        description={description}
        actions={(<>
          {view === 'expenses' && (
            <Button
              variant={'outline'}
              tone={'excel'}
              loading={exporting}
              disabled={!baseRows.length}
              onClick={() => { void downloadExpenses(); }}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
            >
              엑셀 다운로드
            </Button>
          )}
          {view === 'transactions' && renderManualRegistration && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.matchMedia('(max-width: 767px)').matches) {
                  router.push(`/manage/${propertyId}/banking/manual`);
                  return;
                }
                setManualOpen(true);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              수동 입금 등록
            </Button>
          )}
          {view === 'transactions' && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.matchMedia('(max-width: 767px)').matches) {
                  const query = new URLSearchParams({
                    month: currentMonth
                  });
                  if (accountId !== 'ALL') query.set('account', accountId);
                  router.push(`/manage/${propertyId}/banking/manual-expense?${query}`);
                  return;
                }
                setManualExpenseOpen(true);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              수동 지출 등록
            </Button>
          )}
          {view === 'transactions' && (
            <Button
              variant={'outline'}
              tone={'excel'}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
              disabled={busy || (accountId !== 'ALL' && !canImport)}
              onClick={() => router.push(`/manage/${propertyId}/banking/upload${accountId === 'ALL' ? '' : `?account=${encodeURIComponent(accountId)}`}`)}
            >
              엑셀 업로드
            </Button>
          )}
          {view === 'upload' && (
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => router.push(`/manage/${propertyId}/banking/transactions`)}
            >
              거래내역으로 돌아가기
            </Button>
          )}
        </>
        )}
      />
      {view === 'transactions' && accountId !== 'ALL' && !canImport && (
        <p
          role={'status'}
        >
          {`${importAccount?.bankName ?? '선택 통장'}: ${importMessage}`}
        </p>
      )}
      {view === 'upload' && (
        <div
          className={styles['account-filter']}
        >
          <Dropdown
            label={'가져올 통장'}
            aria-label={'가져올 통장'}
            value={activeAccountId ?? ''}
            disabled={busy}
            options={accounts.filter((a) => a.status === 'ACTIVE').map((a) => ({
              value: a.id,
              label: accountLabel(a.id)
            }))}
            onChange={(value) => { setAccountId(value);setSelection(null);setPage(1);resetUpload(); }}
          />
        </div>
      )}
      {view === 'upload' && (!preview || replacingFile) && (
        <FileDropzone
          label={'통장 거래 파일 업로드'}
          inputLabel={'통장 거래 파일 선택'}
          accept={importSupport?.extensions.join(',') ?? ''}
          description={canImport ? `${importAccount.bankName} 거래내역만 업로드해주세요. ${importMessage} · 최대 5MB·5,000행` : `${importAccount?.bankName ?? '선택 통장'}: ${importMessage}`}
          busy={busy}
          disabled={!canImport}
          onFile={(next) => { void readFile(next); }}
        />
      )}
      {preview && (
        <div
          className={styles['upload-info']}
        >
          <div
            className={styles['file-info']}
          >
            <span
              className={styles['file-icon']}
            >
              <ServiceIcon
                name={'excel'}
              />
            </span>
            <div>
              <strong>
                {file?.name}
              </strong>
              {preview.period && (
                <p>
                  {`거래 기간 ${preview.period.from} ~ ${preview.period.to}`}
                </p>
              )}
              <p>
                {`미리보기 ${preview.rows.length}건 · 중복 제외 ${preview.duplicateCount}건 · 인계 이전 제외 ${preview.beforeCutoffCount}건`}
              </p>
            </div>
          </div>
          <Button
            variant={'outline'}
            tone={'excel'}
            leadingIcon={(
              <ServiceIcon
                name={'excel'}
              />
            )}
            disabled={busy}
            onClick={() => setReplacingFile((current) => !current)}
          >
            {replacingFile ? '파일 선택 닫기' : '다른 파일 선택'}
          </Button>
        </div>
      )}
      {(view !== 'upload' || preview) && (
        <>
          <div
            className={styles.summary}
            data-view={view}
          >
            {(preview || showIncome) && (
              <SummaryCard
                density={'compact'}
                label={'입금 합계'}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={'입금 합계 도움말'}
                    title={'입금 합계'}
                  >
                    {summaryDescription}
                  </InfoTooltip>
                )}
                value={formatInteger(income)}
                unit={'원'}
                tone={'success'}
                icon={(
                  <ServiceIcon
                    name={'coins'}
                  />
                )}
              />
            )}
            {(preview || showExpense || view === 'expenses') && (
              <SummaryCard
                density={'compact'}
                label={view === 'expenses' ? '지출 합계' : '출금 합계'}
                tone={view === 'expenses' ? 'warning' : 'neutral'}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={view === 'expenses' ? '지출 합계 도움말' : '출금 합계 도움말'}
                    title={view === 'expenses' ? '지출 합계' : '출금 합계'}
                  >
                    {view === 'expenses' ? `${currentMonth} 기준` : summaryDescription}
                  </InfoTooltip>
                )}
                value={formatInteger(view === 'expenses' ? buildingExpense : expense)}
                unit={'원'}
                icon={(
                  <ServiceIcon
                    name={'receipt'}
                  />
                )}
              />
            )}
            {view !== 'expenses' && (
              <SummaryCard
                density={'compact'}
                label={'입출금 차액'}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={'입출금 차액 도움말'}
                    title={'입출금 차액'}
                  >
                    입금 합계 − 출금 합계
                  </InfoTooltip>
                )}
                value={formatInteger(netAmount)}
                unit={'원'}
                valueTone={netAmount < BigInt(0) ? 'danger' : 'neutral'}
                icon={(
                  <ServiceIcon
                    name={'coins'}
                  />
                )}
              />
            )}
            {view !== 'expenses' && (
              <SummaryCard
                density={'compact'}
                label={'확인 필요'}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={'확인 필요 도움말'}
                    title={'확인 필요'}
                  >
                    {`조회 거래 ${baseRows.length}건 중 처리를 확인해야 하는 거래 건수입니다.`}
                  </InfoTooltip>
                )}
                value={baseRows.filter((row) => row.status === 'PENDING').length}
                unit={'건'}
                tone={'warning'}
                icon={(
                  <ServiceIcon
                    name={'info'}
                  />
                )}
              />
            )}
            {view === 'transactions' && (
              <SummaryCard
                density={'compact'}
                label={'최근 은행 확인 잔액'}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={'최근 은행 확인 잔액 도움말'}
                    title={'최근 은행 확인 잔액'}
                    note={[latestDescription, '실시간 잔액이 아니며 수동 입출금은 반영되지 않습니다.'].filter(Boolean).join(' · ')}
                  >
                    {accountId === 'ALL'
                      ? '통장을 선택하면 은행 거래 파일의 마지막 잔액을 표시합니다.'
                      : '은행 거래 파일에 기록된 마지막 거래 후 잔액입니다.'}
                  </InfoTooltip>
                )}
                value={latestValue}
                unit={latest ? '원' : ''}
                icon={(
                  <ServiceIcon
                    name={'bank'}
                  />
                )}
              />
            )}
          </div>
          <div
            className={styles.card}
          >
            {view !== 'expenses' && (
              <FilterTabs
                label={'입출금 필터'}
                value={direction}
                onChange={(value) => { setSelection(null); setDirection(value); setStatus('ALL'); setPage(1); }}
                items={[
                  {
                    value: 'ALL',
                    label: '전체',
                    count: activeRows.length
                  }, {
                    value: 'INCOME',
                    label: '입금',
                    count: activeRows.filter((r) => r.direction === 'INCOME').length
                  }, {
                    value: 'EXPENSE',
                    label: '출금',
                    count: activeRows.filter((r) => r.direction === 'EXPENSE').length
                  }, ...(view === 'transactions' && !preview ? [{
                    value: 'CANCELED',
                    label: '취소 내역',
                    count: baseRows.filter((row) => row.status === 'CANCELED').length
                  }] : [])
                ]}
              />
            )}
            <div
              className={styles.filters}
              data-preview={Boolean(preview)}
            >
              {!preview && (
                <MonthPicker
                  value={currentMonth}
                  onChange={changeMonth}
                  label={'조회 월'}
                  labelHidden
                />
              )}
              <Input
                aria-label={'거래 검색'}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(event) => { setSelection(null); setSearch(event.target.value); setPage(1); }}
              />
              {!preview && view !== 'upload' && (
                <Dropdown
                  aria-label={'조회 통장'}
                  value={accountId}
                  disabled={busy}
                  options={[{
                    value: 'ALL',
                    label: '전체 통장'
                  }, ...accounts.map((account) => ({
                    value: account.id,
                    label: accountLabel(account.id)
                  }))]}
                  onChange={(value) => {
                    setAccountId(value); setSelection(null); setPage(1);
                    const next = new URLSearchParams(searchParams.toString()); next.set('account', value); next.set('month', currentMonth);
                    router.replace(`?${next}`, {
                      scroll: false
                    });
                  }}
                />
              )}
              {view === 'transactions' && !preview && (
                <Dropdown
                  aria-label={'처리 상태'}
                  disabled={direction === 'CANCELED'}
                  value={status}
                  onChange={(value) => { setSelection(null); setStatus(value); setPage(1); }}
                  options={[{
                    value: 'ALL',
                    label: '모든 상태'
                  }, {
                    value: 'PENDING',
                    label: '확인 필요'
                  }, {
                    value: 'CONFIRMED',
                    label: '처리 완료'
                  }, {
                    value: 'ON_HOLD',
                    label: '보류'
                  }]}
                />
              )}
              {view === 'expenses' && (
                <Dropdown
                  aria-label={'부담 동'}
                  value={building}
                  onChange={(value) => { setSelection(null); setBuilding(value); setPage(1); }}
                  options={[{
                    value: 'ALL',
                    label: '전체 동'
                  }, ...buildings.map((b) => ({
                    value: b.id,
                    label: b.label
                  }))]}
                />
              )}

              <Dropdown
                aria-label={'표시 개수'}
                value={String(pageSize)}
                options={[10, 20, 50].map((size) => ({
                  value: String(size),
                  label: `${size}개씩 보기`
                }))}
                onChange={(value) => { setSelection(null); setPageSize(Number(value)); setPage(1); }}
              />

            </div>
            {preview && (
              <p
                className={styles.help}
              >
                행을 눌러 입금 분류·연결 세대·동별 배분을 설정하세요. 필터·페이지를 바꿔도 선택과 입력은 유지됩니다.
              </p>
            )}
            {view === 'transactions' && !preview && (
              <div
                className={styles['selection-bar']}
              >
                <span
                  role={'status'}
                >
                  {isSelecting ? `${deletingRows.length}건 선택` : `총 ${filtered.length}건`}
                </span>
                <div>
                  {isSelecting && (
                    <Button
                      variant={'outline'}
                      tone={'danger'}
                      size={'sm'}
                      disabled={busy || !deletingRows.length}
                      onClick={() => { setDeleteError(''); setDeleteOpen(true); }}
                    >
                      선택 삭제
                    </Button>
                  )}
                  <Button
                    variant={'text'}
                    size={'sm'}
                    aria-pressed={isSelecting}
                    disabled={busy || (!filtered.some(canDelete) && !isSelecting)}
                    onClick={() => setSelection(isSelecting ? null : {
                      scope: selectionScope,
                      ids: []
                    })}
                  >
                    {isSelecting ? '완료' : '편집'}
                  </Button>
                </div>
              </div>
            )}
            <DataTable
              label={preview ? '업로드 거래 미리보기' : view === 'expenses' ? '지출 내역' : '통장 거래'}
              rows={visible}
              getRowKey={(row) => row.id}
              emptyState={(
                <StateMessage
                  variant={showNoResults ? 'no-results' : 'empty-data'}
                  layout={'inline'}
                  title={showNoResults ? '조건에 맞는 검색 결과가 없어요.' : '아직 등록된 거래가 없어요.'}
                  description={showNoResults ? '조회 월이나 검색·필터 조건을 변경해주세요.' : '거래를 등록하면 이곳에서 확인할 수 있어요.'}
                />
              )}
              minWidth={view === 'expenses' ? 340 : 800}

              onRowClick={(row) => {
                if (isSelecting) { toggleDeletion(row.id); return; }
                if (!preview && row.transferCandidate) {
                  if (window.matchMedia('(max-width: 767px)').matches) { router.push(`/manage/${propertyId}/banking/transactions/${row.id}?month=${currentMonth}`);return; }
                  setTransferDetail(row);return;
                }
                if (preview) { setEditingId((current) => current === row.id ? null : row.id); return; }
                if (window.matchMedia('(max-width: 767px)').matches) {
                  const query = new URLSearchParams({
                    month: currentMonth
                  });
                  if (view === 'expenses') query.set('from', 'expenses');
                  if (accountId !== 'ALL') query.set('account', accountId);
                  router.push(`${row.paymentId ? `/manage/${propertyId}/banking/receipts/${row.paymentId}` : `/manage/${propertyId}/banking/transactions/${row.id}`}?${query}`);
                  return;
                }
                setDetail({
                  id: row.paymentId ?? row.id,
                  kind: row.paymentId ? 'receipt' : 'expense'
                });
              }}
              columns={([
                ...(isSelecting ? [{
                  key: 'delete-select',
                  width: 56,
                  header: (
                    <input
                      type={'checkbox'}
                      aria-label={'현재 페이지 거래 전체 선택'}
                      disabled={busy || !selectableRows.length}
                      checked={Boolean(selectableRows.length) && deletingRows.length === selectableRows.length}
                      onChange={(event) => setSelection({
                        scope: selectionScope,
                        ids: event.target.checked ? selectableRows.map((row) => row.id) : []
                      })}
                    />
                  ),
                  render: (row: BankingTransaction) => (
                    <input
                      type={'checkbox'}
                      aria-label={`${row.payer} 거래 선택`}
                      disabled={busy || !canDelete(row)}
                      title={!canDelete(row) ? row.sourceType === 'MANUAL' ? '수동 지출의 확정 이력은 직접 삭제할 수 없습니다.' : '확정 수납은 먼저 취소해주세요. 은행 취소 이력은 원본에서 관리합니다.' : undefined}
                      checked={deletingRows.some((item) => item.id === row.id)}
                      onChange={() => toggleDeletion(row.id)}
                    />
                  )
                }] : []),
                ...(preview ? [{
                  key: 'select',
                  header: (
                    <input
                      type={'checkbox'}
                      aria-label={'현재 페이지 거래 전체 선택'}
                      disabled={busy || !visible.length}
                      checked={Boolean(visible.length) && visible.every((r) => !excluded.includes(r.id))}
                      onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((id) => !visible.some((r) => r.id === id)) : [...new Set([...current, ...visible.map((r) => r.id)])])}
                    />
                  ),
                  render: (row: BankingTransaction) => (
                    <input
                      type={'checkbox'}
                      aria-label={`${row.payer} 거래 선택`}
                      disabled={busy}
                      checked={!excluded.includes(row.id)}
                      onChange={() => setExcluded((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                    />
                  )
                }] : []),
                ...(!preview && accounts.length > 1 ? [{
                  key: 'account',
                  header: '통장',
                  render: (row: BankingTransaction) => accountLabel(row.accountId)
                }] : []),
                ...(view === 'transactions' && !preview ? [{
                  key: 'source',
                  header: '등록 방식',
                  render: (row: BankingTransaction) => row.sourceType === 'MANUAL' ? '수동 지출' : manualIds.has(row.id) ? '수동 입금' : '엑셀'
                }] : []),
                {
                  key: 'date',
                  header: '거래일시',
                  render: (row) => (
                    <>
                      <span>
                        {row.date}
                      </span>
                      <small
                        className={styles.muted}
                      >
                        {row.time}
                      </small>
                    </>
                  )
                },
                ...(showIncome ? [{
                  key: 'payer',
                  header: '입금자',
                  render: (row: BankingTransaction) => row.direction === 'INCOME' ? row.payer : '—'
                }] : []),
                ...((showExpense || view === 'expenses') ? [{
                  key: 'counterparty',
                  header: '지출명',
                  render: (row: BankingTransaction) => {
                    if (row.direction !== 'EXPENSE') return '—';
                    const name = (preview ? expenseDraft(row).category : row.expense?.category) || row.payer;

                    return (
                      <span>
                        {name}
                        {row.sourceType === 'MANUAL' && (
                          <small
                            className={styles.muted}
                          >
                            {' · 수동 등록'}
                          </small>
                        )}
                      </span>
                    );
                  }
                }] : []),
                ...(showIncome ? [{
                  key: 'income',
                  header: '입금',
                  render: (row: BankingTransaction) => row.direction === 'INCOME' ? formatWon(row.amount) : '—'
                } satisfies DataTableColumn<BankingTransaction>] : []),
                ...(showExpense ? [{
                  key: 'expense',
                  header: '출금',
                  render: (row: BankingTransaction) => row.direction === 'EXPENSE' ? formatWon(row.amount) : '—'
                } satisfies DataTableColumn<BankingTransaction>] : []),
                ...(view === 'expenses' ? [{
                  key: 'expense-amount',
                  header: '지출액',
                  render: (row: BankingTransaction) => formatWon(getExpenseAmount(row, expenseBuildingIds).toString())
                } satisfies DataTableColumn<BankingTransaction>] : [{
                  key: 'connection',
                  header: '처리 내용',
                  render: (row: BankingTransaction) => {
                    const content = processingContent(row);

                    return (
                      <div
                        className={styles['processing-content']}
                      >
                        <span>
                          {content.title}
                        </span>
                        {content.detail && (
                          <small>
                            {content.detail}
                          </small>
                        )}
                      </div>
                    );
                  }
                }, {
                  key: 'status',
                  header: '처리',
                  render: (row: BankingTransaction) => (
                    <span
                      className={styles.badge}
                      data-state={row.status}
                    >
                      {preview ? '미리보기' : row.status === 'CONFIRMED' ? '처리 완료' : row.status === 'ON_HOLD' ? '보류' : row.status === 'CANCELED' ? '취소' : row.status === 'LINKED' ? '기존 수납 연결' : row.status === 'TRANSFER' ? '이체 연결 완료' : row.status === 'TRANSFER_PENDING' ? '이체 연결 대기' : '확인 필요'}
                    </span>
                  )
                }])
              ] satisfies DataTableColumn<BankingTransaction>[]).map((column) => ({
                ...column,
                align: 'center' as const
              }))}
            />
            <div
              className={styles.pagination}
            >
              <Pagination
                page={currentPage}
                pageSize={pageSize}
                total={filtered.length}
                pageCount={Math.max(1, Math.ceil(filtered.length / pageSize))}
                label={'거래 페이지'}
                unit={'건'}
                onPageChange={(next) => { setSelection(null); setPage(next); }}
              />
            </div>
          </div>
        </>
      )}
      {preview && editingId && (() => {
        const row = preview.rows.find((item) => item.id === editingId);
        if (!row) return null;
        const invalid = !transferRows.includes(row.id) && row.direction === 'EXPENSE' && Boolean(calculateExpenseAllocation(row.amount, expenseDraft(row)).error);
        return (
          <ClientModal
            className={styles['editor-modal']}
            aria-labelledby={'banking-editor-title'}
            busy={busy}
            onClose={() => setEditingId(null)}
            closeOnOutsideClick
          >
            <header
              className={styles['editor-header']}
            >
              <div>
                <p>
                  {row.direction === 'EXPENSE' ? '지출 설정' : '입금 설정'}
                </p>
                <h2
                  id={'banking-editor-title'}
                >
                  {row.payer}
                </h2>
              </div>
              <Button
                variant={'ghost'}
                size={'sm'}
                iconOnly
                aria-label={'거래 설정 닫기'}
                disabled={busy}
                onClick={() => setEditingId(null)}
                leadingIcon={(
                  <ServiceIcon
                    name={'close'}
                  />
                )}
              />
            </header>
            <div
              className={styles['editor-body']}
            >
              <div
                className={styles['original-info']}
              >
                <div>
                  <span>
                    {row.date}
                    {' '}
                    {row.time}
                  </span>
                  <p>
                    <b>
                      {row.direction === 'INCOME' ? '입금' : '출금'}
                    </b>
                    <span>
                      {data.accounts?.find((account) => account.id === row.accountId)?.bankName}
                      {' '}
                      ····
                      {data.accounts?.find((account) => account.id === row.accountId)?.last4}
                    </span>
                  </p>
                </div>
                <strong>
                  {formatWon(row.amount)}
                </strong>
              </div>
              {/* 다른 등록 통장이 있을 때만 내부 이체 분류를 선택할 수 있게 합니다. */}
              {accounts.length > 1 && (
                <div
                  className={styles['transfer-settings']}
                  data-active={transferRows.includes(row.id)}
                >
                  <label
                    className={styles['transfer-choice']}
                  >
                    <input
                      type={'checkbox'}
                      checked={transferRows.includes(row.id)}
                      aria-label={'관리 통장 간 이체'}
                      aria-describedby={'transfer-setting-help'}
                      disabled={busy}
                      onChange={(event) => setTransferRows((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                    />
                    <span>
                      <strong>
                        관리 통장 간 이체
                      </strong>
                      <small
                        id={'transfer-setting-help'}
                      >
                        등록한 다른 통장으로 옮긴 돈이에요.
                      </small>
                    </span>
                  </label>
                </div>
              )}
              {!transferRows.includes(row.id) && previewEditor(row)}
            </div>
            <footer
              className={styles['editor-actions']}
            >
              <Button
                disabled={busy || invalid}
                onClick={() => setEditingId(null)}
              >
                설정 완료
              </Button>
            </footer>
          </ClientModal>
        );
      })()}
      {transferDetail && data.rows.find((row) => row.id === transferDetail.id) && (
        <TransferDetail
          propertyId={propertyId}
          row={data.rows.find((row) => row.id === transferDetail.id)!}
          data={data}
          onClose={() => setTransferDetail(null)}
        />
      )}
      {detail?.kind === 'expense' && (
        <BankingExpensePage
          propertyId={propertyId}
          transactionId={detail.id}
          presentation={'modal'}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === 'receipt' && renderReceiptDetail?.(detail.id, () => setDetail(null), (id, nextStatus) => {
        setDetail({
          id,
          kind: 'receipt'
        });
        setStatus(['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(nextStatus) ? nextStatus : 'ALL');
        setSelection(null);
        setPage(1);
      })}
      {manualExpenseOpen && (
        <ManualExpense
          propertyId={propertyId}
          initialAccountId={activeAccountId}
          onClose={() => setManualExpenseOpen(false)}
          onCreated={(_id, date, savedAccountId) => {
            setManualExpenseOpen(false);
            setMonth(date.slice(0, 7));
            setAccountId(savedAccountId);
            setBuilding('ALL');
            setDirection('EXPENSE');
            setStatus('ALL');
            setSearch('');
            setPage(1);
            const query = new URLSearchParams({
              month: date.slice(0, 7),
              account: savedAccountId
            });
            router.replace(`/manage/${propertyId}/banking/transactions?${query}`, {
              scroll: false
            });
            notify('지출을 등록했어요.', 'success');
          }}
        />
      )}
      {manualOpen && renderManualRegistration?.(() => setManualOpen(false), (id, date) => {
        setManualOpen(false);
        setSelection(null);
        changeMonth(date.slice(0, 7));
        setDirection('INCOME');
        setStatus('ALL');
        setSearch('');
        setPage(1);
        setDetail({
          id,
          kind: 'receipt'
        });
      })}
      {preview && (
        <BankImportActions
          selectedCount={selected.length}
          incomeCount={selectedIncome}
          busy={busy}
          onSave={() => { void commit(); }}
        />
      )}
      {deleteOpen && (
        <ClientModal
          className={`${styles['editor-modal']} ${styles['delete-modal']}`}
          aria-labelledby={'banking-delete-title'}
          aria-describedby={'banking-delete-description'}
          busy={busy}
          onClose={() => setDeleteOpen(false)}
        >
          <header
            className={styles['delete-header']}
          >
            <h2
              id={'banking-delete-title'}
            >
              거래를 삭제할까요?
            </h2>
            <Button
              variant={'ghost'}
              tone={'neutral'}
              size={'sm'}
              iconOnly
              aria-label={'선택 삭제 확인 닫기'}
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </header>
          <div
            className={styles['delete-body']}
          >
            <ul
              className={styles['delete-transactions']}
              aria-label={'삭제할 거래'}
            >
              {deletingRows.map((row) => (
                <li
                  key={row.id}
                >
                  <strong>
                    {`${row.payer || '거래'} · ${row.direction === 'INCOME' ? '입금' : '출금'} ${formatWon(row.amount)}`}
                  </strong>
                  <span>
                    {`${row.date.replaceAll('-', '. ')}${row.time ? `  ${row.time.slice(0, 8)}` : ''}`}
                  </span>
                </li>
              ))}
            </ul>
            <p
              id={'banking-delete-description'}
              className={styles['delete-description']}
            >
              연결된 수납은 취소되며, 처리 이력은 보관됩니다.
            </p>
            {deleteError && (
              <p
                role={'alert'}
              >
                {deleteError}
              </p>
            )}
          </div>
          <footer
            className={styles['delete-actions']}
          >
            <Button
              variant={'outline'}
              tone={'neutral'}
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
            >
              취소
            </Button>
            <Button
              tone={'danger'}
              loading={busy}
              onClick={() => { void removeSelected(); }}
            >
              삭제
            </Button>
          </footer>
        </ClientModal>
      )}
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          tone={notice.tone === 'error' ? 'error' : undefined}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );
}
