'use client';

import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { TransferDetail } from '../../../_components/transfer-detail/transferDetail';
import { BankingExpensePage } from '../../../banking-expense-page/bankingExpensePage';
import { ManualExpense } from '../../../manual-expense/manualExpense';
import styles from './bankingTransactionDialogs.module.css';
type Props = ReturnType<typeof useBankingWorkspace>['dialogs'];
/** BankingTransactionDialogs에 필요한 표시와 공통 UI를 조합합니다. */
export function BankingTransactionDialogs({
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
}:Props) {
  return (<>
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
        onCreated={(_id, date, savedAccountId, transfer) => {
          setManualExpenseOpen(false);
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
          notify(transfer ? '계좌 간 이체를 등록했어요.' : '지출을 등록했어요.', 'success');
        }}
      />
    )}
    {manualOpen && renderManualRegistration?.(() => setManualOpen(false), (id, date, transferAccountId) => {
      setManualOpen(false);
      setSelection(null);
      setDirection('INCOME');
      setStatus('ALL');
      setSearch('');
      setPage(1);
      if (transferAccountId) {
        setAccountId(transferAccountId);
        setDetail(null);
        const query = new URLSearchParams({
          month: date.slice(0, 7),
          account: transferAccountId
        });
        router.replace(`/manage/${propertyId}/banking/transactions?${query}`, {
          scroll: false
        });
        notify('계좌 간 이체를 등록했어요.', 'success');

        return;
      }
      changeMonth(date.slice(0, 7));
      setDetail({
        id,
        kind: 'receipt'
      });
    })}
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
                  {`${data.accounts?.find((account) => account.id === row.accountId)?.alias ?? data.accounts?.find((account) => account.id === row.accountId)?.bankName ?? '관리 통장'} · ${row.date.replaceAll('-', '. ')}${row.time ? `  ${row.time.slice(0, 8)}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
          <p
            id={'banking-delete-description'}
            className={styles['delete-description']}
          >
            확정된 수납·지출은 취소 이력을 남기고 삭제하며 처리 이력은 보관됩니다. 이체는 먼저 취소해야 하며 연결된 양쪽 거래를 함께 삭제합니다.
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
            onClick={() => {
              void removeSelected();
            }}
          >
            삭제
          </Button>
        </footer>
      </ClientModal>
    )}
  </>);
}
