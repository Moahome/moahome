'use client';

import { BankImportEditor } from '@/entities/banking';
import type { BankingTransaction } from '../../../../api/bankingApiTypes';

import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import {
  calculateTransferAllocation,
  getBankAccountLabel
} from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Dropdown } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { calculateExpenseAllocation } from '../../../../model/expenseAllocation';
import { TransferAllocation } from '../../../_components/transfer-allocation/transferAllocation';
import styles from './bankingImportSettings.module.css';
type Props = ReturnType<typeof useBankingWorkspace>['importSettings'];

/** BankingWorkspace 화면의 ImportSettings 표시 영역을 독립적으로 구성합니다. */
export function BankingImportSettings({
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
}: Props) {
  if (!preview || !editingId)
    return null;

  const row = preview.rows.find((item) => item.id === editingId);
  if (!row)
    return null;
  const invalid = transferRows.includes(row.id) ? !transferAccounts[row.id] || Boolean(calculateTransferAllocation(row.amount, transferAllocations[row.id] ?? [], buildings.length > 0).error) : row.direction === 'EXPENSE' && Boolean(calculateExpenseAllocation(row.amount, expenseDraft(row)).error);
  let transferDescription = '선택한 상대 통장도 같은 금액으로 자동 반영합니다. 수납·비용을 새로 만들지 않고 동별 보유금도 함께 옮깁니다.';
  if (row.transferId)
    transferDescription = '이미 반영한 이체의 은행 원본입니다. 다시 차감하지 않고 기존 이체에 연결합니다.';
  if (row.automaticTransfer && row.status === 'CANCELED')
    transferDescription = '취소된 이체의 은행 원본입니다. 취소 상태를 유지하고 원본만 연결합니다.';

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
                {getBankAccountLabel(data.accounts?.find((account) => account.id === row.accountId))}
              </span>
            </p>
          </div>
          <strong>
            {formatWon(row.amount)}
          </strong>
        </div>
        {/* 다른 등록 통장이 있을 때만 내부 이체 분류를 선택할 수 있게 합니다. */}
        {canTransfer(row) && (
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
              disabled={busy || Boolean(row.transferId)}
              onChange={(event) => setTransferRows((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
            />
            <span>
              <strong>
                관리 통장 간 이체
              </strong>
              <small
                id={'transfer-setting-help'}
              >
                {row.direction === 'INCOME'
                  ? '모아홈에 등록한 다른 관리 통장에서 들어온 돈일 때만 선택하세요.'
                  : '모아홈에 등록한 다른 관리 통장으로 보낸 돈일 때만 선택하세요.'}
              </small>
            </span>
          </label>
        </div>
        )}
        {transferRows.includes(row.id) && (
        <div
          className={styles['receipt-editor']}
        >
          <Dropdown
            label={row.direction === 'INCOME' ? '출금 통장' : '입금 통장'}
            value={transferAccounts[row.id] ?? ''}
            disabled={busy || Boolean(row.transferId)}
            options={accounts.filter((account) => account.id !== row.accountId && (account.status === 'ACTIVE' || account.id === row.transferAccountId)).map((account) => ({
              value: account.id,
              label: getBankAccountLabel(account)
            }))}
            onChange={(value) => setTransferAccounts((current) => ({
              ...current,
              [row.id]: value
            }))}
          />
          <p>
            {transferDescription}
          </p>
          {buildings.length > 0 && (
          <TransferAllocation
            key={row.id}
            propertyId={propertyId}
            outgoingAccountId={row.direction === 'EXPENSE' ? row.accountId : transferAccounts[row.id] ?? ''}
            date={row.date}
            total={row.amount}
            buildings={buildings}
            value={transferAllocations[row.id] ?? []}
            onChange={(value) => setTransferAllocations((current) => ({
              ...current,
              [row.id]: value
            }))}
            disabled={busy || Boolean(row.transferAllocations?.length)}
          />
          )}
        </div>
        )}
        {!transferRows.includes(row.id) && <BankingDraftEditor
          row={row}
          {...editor}
                                           />}
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
}

/** 입금·지출 초안 편집기는 동일한 거래 설정 모달 안에서 재사용합니다. */
function BankingDraftEditor({
  row,
  data,
  buildings,
  busy,
  receiptDraft,
  expenseDraft,
  changeReceipt,
  changeExpense
}: Props['editor'] & {row: BankingTransaction}) {
  return (
    <div
      className={row.direction === 'INCOME' || !buildings.length ? styles['receipt-editor'] : undefined}
    >
      <BankImportEditor
        direction={row.direction}
        expenseAccounts={data.expenseAccounts}
        amount={row.amount}
        suggestedUnitId={row.unitId}
        units={data.units}
        buildings={buildings}
        receipt={receiptDraft(row)}
        expense={expenseDraft(row)}
        disabled={busy}
        onReceiptChange={(draft) => changeReceipt(row.id, draft)}
        onExpenseChange={(draft) => changeExpense(row.id, draft)}
      />
    </div>
  );
}
