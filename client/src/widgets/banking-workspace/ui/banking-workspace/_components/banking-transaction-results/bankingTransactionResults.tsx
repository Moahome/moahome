'use client';

import { BuildingFilter } from '@/entities/property';
import { BankingTransactionSummary } from './bankingTransactionSummary';
import { BankingTransactionTable } from './bankingTransactionTable';

import {
  BANKING_STATUS_OPTIONS,
  BANKING_PAGE_SIZES
} from '../../../../constant/bankingOptions';
import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import { Button } from '@/shared/ui/button';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { DateRangePicker } from '@/shared/ui/date-range-picker';
import { Pagination } from '@/shared/ui/pagination';
import styles from './bankingTransactionResults.module.css';
type Props = ReturnType<typeof useBankingWorkspace>['results'];

/** BankingWorkspace 화면의 Section 표시 영역을 독립적으로 구성합니다. */
export function BankingTransactionResults({
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
  summaryColumns,
  searchPlaceholder,
  expenseDraft,
  processingContent,
  directionTabs
}: Props) {
  return (<>
    {(view !== 'upload' || preview) && (
      <>
        <BankingTransactionSummary
          {...{
            view,
            summaryColumns,
            preview,
            showIncome,
            summaryDescription,
            income,
            showExpense,
            periodLabel,
            buildingExpense,
            expense,
            netAmount,
            baseRows,
            status
          }}
        />
        <div
          className={styles.card}
        >
          {view !== 'expenses' && (
            <FilterTabs
              label={'입출금 필터'}
              value={direction}
              onChange={(value) => {
                setSelection(null);
                setDirection(value);
                setStatus('ALL');
                setProcessing('ALL');
                setPage(1);
              }}
              items={directionTabs}
            />
          )}
          <div
            className={styles.filters}
            data-preview={Boolean(preview)}
            data-no-building-filter={view === 'expenses' && buildings.length === 0}
          >
            {!preview && (
              <DateRangePicker
                value={dateRange}
                onChange={changeDateRange}
                referenceDate={data.asOf}
                label={'조회 기간'}
                labelHidden
                disabled={busy}
              />
            )}
            <Input
              aria-label={'거래 검색'}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => {
                setSelection(null);
                setSearch(event.target.value);
                setPage(1);
              }}
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
                  setAccountId(value);
                  setSelection(null);
                  setPage(1);
                  const next = new URLSearchParams(searchParams.toString());
                  next.set('account', value);
                  if (!next.has('startDate'))
                    next.set('month', currentMonth);
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
                onChange={(value) => {
                  setSelection(null);
                  setStatus(value);
                  setPage(1);
                }}
                options={BANKING_STATUS_OPTIONS}
              />
            )}
            {view === 'expenses' && (
              <BuildingFilter
                aria-label={'부담 동'}
                value={building}
                onChange={(value) => {
                  setSelection(null);
                  setBuilding(value);
                  setPage(1);
                }}
                buildings={buildings.map((b) => ({
                  value: b.id,
                  label: b.label
                }))}
                allValue={'ALL'}
              />
            )}

            {preview && (
              <Dropdown
                aria-label={'처리 내용'}
                value={processing}
                options={processingOptions}
                disabled={busy}
                onChange={(value) => {
                  setProcessing(value);
                  setPage(1);
                }}
              />
            )}
            <Dropdown
              aria-label={'표시 개수'}
              value={String(pageSize)}
              options={BANKING_PAGE_SIZES.map((size) => ({
                value: String(size),
                label: `${size}개씩 보기`
              }))}
              onChange={(value) => {
                setSelection(null);
                setPageSize(Number(value));
                setPage(1);
              }}
            />

          </div>
          {preview && (
            <p
              className={styles.help}
            >
              {data.buildings.length ? '행을 눌러 입금 분류·연결 세대·동별 배분을 설정하세요.' : '행을 눌러 입금 분류·연결 세대·지출을 설정하세요.'}
              {' '}
              필터·페이지를 바꿔도 선택과 입력은 유지됩니다.
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
                    onClick={() => {
                      setDeleteError('');
                      setDeleteOpen(true);
                    }}
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
          <BankingTransactionTable
            {...{
              preview,
              view,
              visible,
              showNoResults,
              isSelecting,
              toggleDeletion,
              searchParams,
              currentMonth,
              accountId,
              router,
              propertyId,
              setTransferDetail,
              setEditingId,
              direction,
              notify,
              setDetail,
              busy,
              selectableRows,
              deletingRows,
              setSelection,
              selectionScope,
              linkedDeletionIds,
              canDelete,
              status,
              excluded,
              setExcluded,
              accounts,
              accountLabel,
              showIncome,
              transferRows,
              expenseDraft,
              data,
              expense,
              showExpense,
              expenseBuildingIds,
              processingContent
            }}
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
              onPageChange={(next) => {
                setSelection(null);
                setPage(next);
              }}
            />
          </div>
        </div>
      </>
    )}
  </>);
}
