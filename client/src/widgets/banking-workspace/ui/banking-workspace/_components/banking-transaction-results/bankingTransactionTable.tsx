'use client';
import { useBankingListActions } from '../../_hooks/useBankingListActions';
import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import { StateMessage } from '@/shared/ui/state-message';
import { getExpenseAccountLabel } from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import type { BankingTransaction } from '../../../../api/bankingApiTypes';
import { getExpenseAmount } from '../../../../model/expenseAllocation';
import styles from './bankingTransactionResults.module.css';
type Props = Pick<ReturnType<typeof useBankingWorkspace>['results'],
 | 'preview'
 | 'view'
 | 'visible'
 | 'showNoResults'
 | 'isSelecting'
 | 'toggleDeletion'
 | 'searchParams'
 | 'currentMonth'
 | 'accountId'
 | 'router'
 | 'propertyId'
 | 'setTransferDetail'
 | 'setEditingId'
 | 'direction'
 | 'notify'
 | 'setDetail'
 | 'busy'
 | 'selectableRows'
 | 'deletingRows'
 | 'setSelection'
 | 'selectionScope'
 | 'linkedDeletionIds'
 | 'canDelete'
 | 'status'
 | 'excluded'
 | 'setExcluded'
 | 'accounts'
 | 'accountLabel'
 | 'showIncome'
 | 'transferRows'
 | 'expenseDraft'
 | 'data'
 | 'expense'
 | 'showExpense'
 | 'expenseBuildingIds'
 | 'processingContent'>;

/** 통장 목록의 거래 표와 행 선택을 표시합니다. */
export function BankingTransactionTable({
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
  excluded,
  setExcluded,
  accounts,
  accountLabel,
  showIncome,
  transferRows,
  expenseDraft,
  data,
  showExpense,
  expenseBuildingIds,
  processingContent
}: Props) {
  const {
    openRow
  } = useBankingListActions({
    isSelecting,
    toggleDeletion,
    preview,
    searchParams,
    currentMonth,
    accountId,
    router,
    propertyId,
    setTransferDetail,
    setEditingId,
    direction,
    notify,
    view,
    setDetail
  });

  return (
    <DataTable
      label={preview ? '업로드 거래 미리보기' : view === 'expenses' ? '지출 내역' : '통장 거래'}
      rows={visible}
      getRowKey={(row) => row.id}
      emptyState={(
        <StateMessage
          variant={showNoResults ? 'no-results' : 'empty-data'}
          layout={'inline'}
          title={showNoResults ? '조건에 맞는 검색 결과가 없어요.' : '아직 등록된 거래가 없어요.'}
          description={showNoResults ? '조회 기간이나 검색·필터 조건을 변경해주세요.' : '거래를 등록하면 이곳에서 확인할 수 있어요.'}
        />
      )}
      minWidth={view === 'expenses' ? 340 : 800}

      onRowClick={openRow}
      columns={([
        ...(isSelecting ? [{
          key: 'delete-select',
          width: 56,
          header: (
            <input
              type={'checkbox'}
              aria-label={'현재 페이지 거래 전체 선택'}
              disabled={busy || !selectableRows.length}
              checked={Boolean(selectableRows.length) && selectableRows.every((row) => deletingRows.some((selected) => selected.id === row.id))}
              onChange={(event) => setSelection({
                scope: selectionScope,
                ids: event.target.checked ? linkedDeletionIds(selectableRows.map((row) => row.id)) : []
              })}
            />
          ),
          render: (row: BankingTransaction) => (
            <input
              type={'checkbox'}
              aria-label={`${row.payer} 거래 선택`}
              disabled={busy || !canDelete(row)}
              title={!canDelete(row) ? row.status === 'TRANSFER' ? '이체를 먼저 취소한 뒤 양쪽 거래를 함께 삭제해주세요.' : '연결된 원본 거래에서 취소·삭제해주세요.' : undefined}
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
        {
          key: 'date',
          header: '거래일',
          render: (row) => (
            <time
              className={styles['transaction-date']}
              dateTime={row.date}
            >
              {row.date}
            </time>
          )
        },
        ...(showIncome ? [{
          key: 'payer',
          header: '입금자',
          render: (row: BankingTransaction) => row.direction === 'INCOME' ? row.payer : '—'
        }] : []),
        ...(view === 'expenses' ? [{
          key: 'expense-account',
          header: '계정과목',
          render: (row: BankingTransaction) => row.transferCandidate || (preview && transferRows.includes(row.id)) ? '계좌 이체' : row.direction === 'EXPENSE'
            ? getExpenseAccountLabel(preview ? {
              ...expenseDraft(row),
              accountName: data.expenseAccounts?.find((account) => account.code === expenseDraft(row).accountCode)?.name
            } : row.expense)
            : '—'
        }] : []),
        ...((showExpense || view === 'expenses') ? [{
          key: 'counterparty',
          header: '지출명',
          render: (row: BankingTransaction) => {
            if (row.direction !== 'EXPENSE')
              return '—';
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
              {preview ? '미리보기' : ['CONFIRMED', 'LINKED', 'TRANSFER'].includes(row.status) ? '처리 완료' : row.status === 'ON_HOLD' ? '보류' : row.status === 'CANCELED' ? '취소' : '확인 필요'}
            </span>
          )
        }])
      ] satisfies DataTableColumn<BankingTransaction>[]).map((column) => ({
        ...column,
        align: 'center' as const
      }))}
    />
  );
}
