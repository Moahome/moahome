'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { SummaryCard } from '@/shared/ui/summary-card';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import {
  bankingError,
  deleteBankingTransactions,
  getBankingWorkspace,
  previewBankingFile,
  importBankingFile,
  type BankingPreview,
  type BankingSelection,
  type BankingTransaction,
  type ExpenseDraft
} from '../../api/bankingApi';
import {
  createExpenseDraft,
  calculateExpenseAllocation,
  getExpenseAmount,
  sortExpenseLabels
} from '../../model/expenseAllocation';
import { createExpenseWorkbook } from '../../model/expenseExport';
import { ExpenseEditor } from '../_components/expense-editor/expenseEditor';
import { BankingExpensePage } from '../banking-expense-page/bankingExpensePage';
import styles from './bankingWorkspace.module.css';

type ReceiptDraft = { kind: 'AUTO' | 'HOUSEHOLD' | 'OTHER' | 'SHARED'; unitId: string; category: string; note: string };

/** 필터·페이지를 바꿔도 파일 전체의 선택·분류 초안을 유지하고 실제 저장은 서버 원본 재검증으로 처리합니다. */
export function BankingWorkspace({ propertyId, view = 'transactions', renderReceiptDetail }: {
  propertyId: string;
  view?: 'transactions' | 'expenses' | 'upload';
  renderReceiptDetail?: (paymentId: string, onClose: () => void) => ReactNode;
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
  const [detail, setDetail] = useState<{ id: string; kind: 'receipt' | 'expense' } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const exportBusyRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ id: number; message: string; tone: 'success' | 'error' } | null>(() => (
    view === 'transactions' && searchParams.get('imported') === '1' ? {
      id: 0,
      message: '선택한 거래를 저장했어요.',
      tone: 'success'
    } : null
  ));
  // 업로드 뒤 목록에서 성공 알림을 한 번 표시하고 새로고침 시 다시 뜨지 않게 이동 표식을 지웁니다.
  useEffect(() => {
    if (view !== 'transactions' || searchParams.get('imported') !== '1') return;
    const query = new URLSearchParams(searchParams.toString());
    query.delete('imported');
    router.replace(`/manage/${propertyId}/banking/transactions${query.size ? `?${query}` : ''}`, {
      scroll: false
    });
  }, [propertyId, router, searchParams, view]);
  const data = workspace.data;
  /** 같은 오류가 연속 발생해도 새 알림으로 표시하도록 현재 알림 번호를 증가시킵니다. */
  function notify(message: string, tone: 'success' | 'error' = 'error') { setNotice((current) => ({
    id: (current?.id ?? 0) + 1,
    message,
    tone
  })); }

  /** 새 파일 검증이 성공한 경우에만 기존 선택·초안을 교체하고 실패하면 재시도 상태를 보존합니다. */
  async function readFile(next: File) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await previewBankingFile(propertyId, next);
      setFile(next); setPreview(result); setExcluded([]); setExpenses({}); setReceipts({}); setEditingId(null);
      setReplacingFile(false);
      setDirection('ALL'); setStatus('ALL'); setSearch(''); setPage(1);
    } catch (error) { notify(bankingError(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (workspace.isPending) return (
    <p
      role={'status'}
    >
      통장 정보를 불러오고 있어요.
    </p>
  );
  if (!data) return (
    <section>
      <h1>
        통장 관리
      </h1>
      <p
        role={'alert'}
      >
        {bankingError(workspace.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => { void workspace.refetch(); }}
      >
        다시 시도
      </Button>
    </section>
  );
  const currentMonth = month ?? data.asOf.slice(0, 7);
  const buildings = sortExpenseLabels(data.buildings);
  const source = preview?.rows ?? (view === 'upload' ? [] : data.rows);
  const baseRows = source.filter((row) => (preview || row.date.startsWith(currentMonth))
    && (view !== 'expenses' || row.expense?.allocations.some((part) => data.buildings.some((item) => item.id === part.buildingId)))
    && (status === 'ALL' || row.status === status)
    && (view !== 'expenses' || building === 'ALL' || row.expense?.allocations.some((a) => a.buildingId === building))
    && `${row.payer} ${row.memo ?? ''} ${row.unitLabel} ${row.expense?.category ?? ''} ${row.expense?.note ?? ''}`.includes(search.trim()));
  const filtered = baseRows.filter((row) => direction === 'ALL' || row.direction === direction);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectionScope = JSON.stringify([propertyId, currentMonth, direction, status, search, pageSize, currentPage]);
  const isSelecting = view === 'transactions' && !preview && selection?.scope === selectionScope;
  const deletingRows = isSelecting ? visible.filter((row) => selection.ids.includes(row.id)) : [];
  function toggleDeletion(id: string) {
    if (busyRef.current) return;
    setSelection({
      scope: selectionScope,
      ids: deletingRows.some((row) => row.id === id)
        ? deletingRows.filter((row) => row.id !== id).map((row) => row.id) : [...deletingRows.map((row) => row.id), id]
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
      const saved = await deleteBankingTransactions(propertyId, deletingRows.map((row) => row.id));
      cache.setQueryData(queryKey, saved);
      for (const key of ['payment-workspace', 'banking-balances', 'billing']) {
        void cache.invalidateQueries({
          queryKey: [key, session.data?.id, propertyId]
        });
      }
      setDeleteOpen(false); setSelection(null); setPage(1);
      notify('선택한 거래를 삭제했어요.', 'success');
    } catch (error) { setDeleteError(bankingError(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const selected = preview?.rows.filter((row) => !excluded.includes(row.id)) ?? [];
  const selectedIncome = selected.filter((row) => row.direction === 'INCOME').length;
  const income = baseRows.filter((row) => row.direction === 'INCOME').reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const expense = baseRows.filter((row) => row.direction === 'EXPENSE').reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
  const expenseBuildings = buildings.filter((item) => building === 'ALL' || item.id === building);
  const expenseBuildingIds = expenseBuildings.map((item) => item.id);
  const buildingExpense = baseRows.reduce((sum, row) => sum + getExpenseAmount(row, expenseBuildingIds), BigInt(0));
  const showIncome = view !== 'expenses' && direction !== 'EXPENSE';
  const showExpense = view !== 'expenses' && direction !== 'INCOME';
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
  const latest = [...data.rows].filter((row) => row.balance !== null).sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))[0];

  function expenseDraft(row: BankingTransaction) { return expenses[row.id] ?? createExpenseDraft(row, data!); }
  function receiptDraft(row: BankingTransaction): ReceiptDraft { return receipts[row.id] ?? {
    kind: 'AUTO',
    unitId: row.unitId,
    category: '',
    note: ''
  }; }
  /** 저장 전 거래 설정은 공통 모달에서 편집하고 닫아도 파일별 초안을 보존합니다. */
  function previewEditor(row: BankingTransaction) {
    if (!data) return null;
    return row.direction === 'EXPENSE' ? (
      <ExpenseEditor
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
              label: '이자 등 기타 입금 · 동별 배분'
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
            <ExpenseEditor
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
    setPreview(null); setFile(null); setExcluded([]); setExpenses({}); setReceipts({}); setEditingId(null); setPage(1); setDirection('ALL');
  }
  /** 서로 다른 필터에서 고른 입출금도 하나의 요청으로 보내고 실패 시 초안 전체를 보존합니다. */
  async function commit() {
    if (!file || !preview || !selected.length || busyRef.current) return;
    const rows: BankingSelection[] = [];
    for (const row of selected) {
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
      const saved = await importBankingFile(propertyId, file, rows);
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
          {view === 'transactions' && (
            <Button
              variant={'outline'}
              tone={'excel'}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
              disabled={busy}
              onClick={() => router.push(`/manage/${propertyId}/banking/upload`)}
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
        </>)}
      />
      {view === 'upload' && (!preview || replacingFile) && (
        <FileDropzone
          label={'통장 거래 파일 업로드'}
          inputLabel={'통장 거래 파일 선택'}
          accept={'.xls,.xlsx,.csv'}
          description={'은행 거래내역만 업로드해주세요. XLS·XLSX·UTF-8 CSV, 최대 5MB·5,000행'}
          busy={busy}
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
      {(view !== 'upload' || preview) && <>
        <div
          className={styles.summary}
          data-view={view}
        >
          {showIncome && (
            <SummaryCard
              density={'compact'}
              label={`${preview ? '파일' : currentMonth} 입금`}
              description={preview ? '업로드 파일 기준' : `${currentMonth} 기준`}
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
          {(showExpense || view === 'expenses') && (
            <SummaryCard
              density={'compact'}
              label={view === 'expenses' ? '지출 합계' : '출금 합계'}
              tone={view === 'expenses' ? 'warning' : 'neutral'}
              description={preview ? '업로드 파일 기준' : `${currentMonth} 기준`}
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
              label={'확인 필요'}
              description={`조회 거래 ${baseRows.length}건 중`}
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
              description={latest ? `${latest.date} ${latest.time ?? ''} 거래 후` : '거래 후 잔액이 있는 원본 기준'}
              value={latest ? formatInteger(latest.balance!) : '확인 필요'}
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
              onChange={(value) => { setSelection(null); setDirection(value); setPage(1); }}
              items={[
                {
                  value: 'ALL',
                  label: '전체',
                  count: baseRows.length
                }, {
                  value: 'INCOME',
                  label: '입금',
                  count: baseRows.filter((r) => r.direction === 'INCOME').length
                }, {
                  value: 'EXPENSE',
                  label: '출금',
                  count: baseRows.filter((r) => r.direction === 'EXPENSE').length
                }
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
                onChange={(value) => { setSelection(null); setMonth(value); setPage(1); }}
                label={'조회 월'}
              />
            )}
            <Input
              aria-label={'거래 검색'}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => { setSelection(null); setSearch(event.target.value); setPage(1); }}
            />
            {view === 'transactions' && !preview && (
              <Dropdown
                aria-label={'처리 상태'}
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
              행을 눌러 연결할 세대나 지출 동을 변경하세요. 필터·페이지를 바꿔도 선택과 입력은 유지됩니다.
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
                  disabled={busy || (!filtered.length && !isSelecting)}
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
            emptyState={'조회할 거래가 없습니다.'}
            minWidth={view === 'expenses' ? 340 : 800}

            onRowClick={(row) => {
              if (isSelecting) { toggleDeletion(row.id); return; }
              if (preview) { setEditingId((current) => current === row.id ? null : row.id); return; }
              if (window.matchMedia('(max-width: 767px)').matches) {
                router.push(row.paymentId ? `/manage/${propertyId}/banking/receipts/${row.paymentId}` : `/manage/${propertyId}/banking/transactions/${row.id}`);
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
                    disabled={busy || !visible.length}
                    checked={Boolean(visible.length) && deletingRows.length === visible.length}
                    onChange={(event) => setSelection({
                      scope: selectionScope,
                      ids: event.target.checked ? visible.map((row) => row.id) : []
                    })}
                  />
                ),
                render: (row: BankingTransaction) => (
                  <input
                    type={'checkbox'}
                    aria-label={`${row.payer} 거래 선택`}
                    disabled={busy}
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
                  return (preview ? expenseDraft(row).category : row.expense?.category) || row.payer;
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
                header: direction === 'ALL' ? '세대·지출 동' : direction === 'INCOME' ? '세대' : '지출 동',
                render: (row: BankingTransaction) => {
                  if (row.direction === 'INCOME' && row.incomeAllocation) return sortExpenseLabels(row.incomeAllocation.allocations).map((part) => part.label).join(' · ');
                  if (row.direction === 'INCOME' && preview && receiptDraft(row).kind === 'SHARED') return sortExpenseLabels(expenseDraft(row).allocations).map((part) => part.label).join(' · ');
                  if (row.direction === 'INCOME') return data.units.find((u) => u.id === row.unitId)?.label || row.unitLabel || '세대·용도 확인';
                  const draft = preview ? expenseDraft(row) : row.expense;
                  if (!draft) return '지출 동 확인 필요';
                  // 외부로 등록한 101동도 실제 지출에 참여하므로 지정한 모든 부담 동을 개수에 포함합니다.
                  const buildingCount = new Set(draft.allocations.filter((part) => part.label.trim()).map((part) => part.buildingId ?? `external:${part.label.trim()}`)).size;
                  return buildingCount ? `${buildingCount}동` : '지출 동 확인 필요';
                }
              }, {
                key: 'status',
                header: '처리',
                render: (row: BankingTransaction) => (
                  <span
                    className={styles.badge}
                    data-state={row.status}
                  >
                    {preview ? '미리보기' : row.status === 'CONFIRMED' ? '처리 완료' : row.status === 'ON_HOLD' ? '보류' : row.status === 'LINKED' ? '기존 수납 연결' : '확인 필요'}
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
      </>}
      {preview && editingId && (() => {
        const row = preview.rows.find((item) => item.id === editingId);
        if (!row) return null;
        const invalid = row.direction === 'EXPENSE' && Boolean(calculateExpenseAllocation(row.amount, expenseDraft(row)).error);
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
                <span>
                  {row.date}
                  {' '}
                  {row.time}
                </span>
                <strong>
                  {formatWon(row.amount)}
                </strong>
              </div>
              {previewEditor(row)}
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
      {detail?.kind === 'expense' && (
        <BankingExpensePage
          propertyId={propertyId}
          transactionId={detail.id}
          presentation={'modal'}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === 'receipt' && renderReceiptDetail?.(detail.id, () => setDetail(null))}
      {preview && (
        <div
          className={styles.actions}
        >
          <span>
            {`선택 입금 ${selectedIncome}건 · 출금 ${selected.length - selectedIncome}건`}
          </span>
          <Button
            disabled={!selected.length || busy}
            loading={busy}
            onClick={() => { void commit(); }}
          >
            선택 거래 처리 (
            {selected.length}
            )
          </Button>
        </div>
      )}
      {deleteOpen && (
        <ClientModal
          className={styles['editor-modal']}
          aria-labelledby={'banking-delete-title'}
          busy={busy}
          onClose={() => setDeleteOpen(false)}
        >
          <header
            className={styles['editor-header']}
          >
            <h2
              id={'banking-delete-title'}
            >
              선택한 거래를 삭제할까요?
            </h2>
            <Button
              variant={'ghost'}
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
            <p>
              {`선택한 거래 ${deletingRows.length}건을 삭제합니다. 같은 엑셀 파일로 다시 가져올 수 있습니다.`}
            </p>
            <p>
              연결된 수납과 청구 충당은 취소하고 동별 입출금·잔고에서 제외합니다. 기존 거래·배분·정산 연결은 이력으로 보관합니다.
            </p>
            <ul>
              {deletingRows.map((row) => (
                <li
                  key={row.id}
                >
                  {row.date}
                  {' '}
                  ·
                  {' '}
                  {row.payer}
                  {' '}
                  ·
                  {' '}
                  {row.direction === 'INCOME' ? '입금' : '출금'}
                  {' '}
                  {formatWon(row.amount)}
                </li>
              ))}
            </ul>
            {deleteError && (
              <p
                role={'alert'}
              >
                {deleteError}
              </p>
            )}
          </div>
          <footer
            className={styles['editor-actions']}
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
              variant={'outline'}
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
