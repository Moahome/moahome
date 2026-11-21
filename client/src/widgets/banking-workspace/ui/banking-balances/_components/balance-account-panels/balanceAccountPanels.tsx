'use client';

import { BankAccountEditor } from '@/features/bank-account-management';
import { BankAccountDetails } from '../../../_components/bank-account-details/bankAccountDetails';
import type {
  BalanceAccountContentProps,
  BalanceAccountEditorProps
} from '../../_types/balancePanelTypes';

import { BankInitialBalanceForm } from './bankInitialBalanceForm';
import { useBankInitialBalanceEditor } from './_hooks/useBalanceAccountPanels';
import { Button } from '@/shared/ui/button';
import type {
  AccountBalance,
  BalanceWorkspace
} from '../../../../api/bankingBalanceApiTypes';
import { DetailDialog } from '../balance-common/balanceCommon';
import styles from './balanceAccountPanels.module.css';
import { useBankAccountHistory } from './_hooks/useBalanceAccountPanels';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { formatWon } from '@/shared/lib/format';
import { DataTable } from '@/shared/ui/data-table';
import { Pagination } from '@/shared/ui/pagination';
import { RequestError } from '@/shared/ui/server-connection-error';

/** 선택 통장의 시작 금액과 등록된 동별 보유금을 함께 확인하고 한 요청으로 정정합니다. */
export function BankInitialBalanceEditor({
  propertyId,
  account,
  data,
  onClose,
  onSaved,
  presentation = 'modal'
}: {
  propertyId: string;
  account: AccountBalance;
  data: BalanceWorkspace;
  onClose: () => void;
  onSaved: () => Promise<void>;
  presentation?: 'modal' | 'page';
}) {
  const state = useBankInitialBalanceEditor({
    propertyId,
    account,
    data,
    onClose,
    onSaved,
    presentation
  });

  const {
    formId,
    date,
    setDate,
    amount,
    setAmount,
    reason,
    setReason,
    error,
    busy,
    allowed,
    dateChanged,
    confirmedToken,
    setConfirmedToken,
    buildingAmounts,
    setBuildingAmounts,
    impact,
    cash,
    affectedBuildings,
    buildingTotal,
    needsConfirmation,
    bankAmount,
    buildingTotalExceeded,
    impactReady,
    submit
  } = state;

  return (
    <DetailDialog
      title={'초기 잔액 정정'}
      presentation={presentation}
      compact
      busy={busy}
      onClose={onClose}
      footer={(
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          {allowed && (
            <Button
              type={'submit'}
              form={formId}
              loading={busy}
              disabled={!impactReady}
            >
              저장
            </Button>
          )}
        </div>
      )}
    >
      <BankInitialBalanceForm
        {...{
          account,
          data,
          formId,
          date,
          setDate,
          amount,
          setAmount,
          reason,
          setReason,
          error,
          busy,
          allowed,
          dateChanged,
          confirmedToken,
          setConfirmedToken,
          buildingAmounts,
          setBuildingAmounts,
          impact,
          cash,
          affectedBuildings,
          buildingTotal,
          needsConfirmation,
          bankAmount,
          buildingTotalExceeded,
          submit
        }}
      />
    </DetailDialog>
  );
}

/** 정정 버튼을 누를 때만 해당 통장의 이력을 읽고 공통 표에 다섯 건씩 표시합니다. */
export function BankAccountHistory({
  propertyId,
  accountId,
  onClose,
  presentation = 'modal'
}: {
  propertyId: string;
  accountId: string;
  onClose: () => void;
  presentation?: 'modal' | 'page';
}) {
  const state = useBankAccountHistory({
    propertyId,
    accountId,
    onClose,
    presentation
  });

  const {
    setPage,
    query,
    changes,
    pageCount,
    currentPage
  } = state;

  return (
    <DetailDialog
      title={'정정 내역'}
      className={styles['correction-dialog']}
      presentation={presentation}
      onClose={onClose}
      footer={query.isSuccess && changes.length > 0 ? (
        <Pagination
          label={'정정 내역 페이지'}
          unit={'건'}
          total={changes.length}
          page={currentPage}
          pageCount={pageCount}
          pageSize={5}
          onPageChange={setPage}
        />
      ) : undefined}
    >
      {query.isPending && (
        <LoadingState
          title={'정정 내역을 불러오고 있어요.'}
          layout={'inline'}
        />
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && (
        <DataTable
          label={'정정 내역'}
          rows={changes.slice((currentPage - 1) * 5, currentPage * 5)}
          getRowKey={(change) => change.id}
          minWidth={760}
          emptyState={(
            <StateMessage
              variant={'empty-data'}
              layout={'inline'}
              title={'정정 내역이 없습니다.'}
            />
          )}
          columns={[{
            key: 'date',
            header: '수정일',
            width: 120,
            render: (change) => new Date(change.changedAt).toLocaleDateString('sv-SE', {
              timeZone: 'Asia/Seoul'
            })
          }, {
            key: 'details',
            header: '변경 내용',
            render: (change) => (
              <div
                className={styles['correction-changes']}
              >
                {change.details.filter((part) => change.kind !== 'HANDOVER' || part.targetId === accountId).map((part) => (
                  <div
                    key={part.targetId}
                  >
                    <span>
                      {part.targetId === accountId ? '통장 시작 잔액' : part.label}
                    </span>
                    {(part.previousAmount !== null || part.newAmount !== null) && (
                      <strong>
                        {part.previousAmount === null ? '미설정' : formatWon(part.previousAmount)}
                        {' '}
                        →
                        {' '}
                        {part.newAmount === null ? '미설정' : formatWon(part.newAmount)}
                      </strong>
                    )}
                    {part.previousDate !== part.newDate && <span>
                      {part.previousDate ?? '미설정'}
                      {' '}
                      →
                      {' '}
                      {part.newDate ?? '미설정'}
                    </span>}
                    {part.newBillingMonth && <span>
                      첫 부과월
                      {part.previousBillingMonth}
                      {' '}
                      →
                      {part.newBillingMonth}
                    </span>}
                  </div>
                ))}
              </div>
            )
          }, {
            key: 'reason',
            header: '사유',
            render: (change) => change.reason
          }, {
            key: 'actor',
            header: '수정자',
            width: 100,
            render: (change) => change.changedByName
          }]}
        />
      )}
    </DetailDialog>
  );
}
/** 조회 범위에 속한 통장 상세와 관리 행동을 모달·페이지에서 공유합니다. */
export function BalanceAccountContent({
  targetId,
  data,
  userId,
  propertyId,
  month,
  accountId,
  openPanel,
  onEdit,
  onTransactions
}: BalanceAccountContentProps) {
  const account = data.accounts?.find((item) => item.id === targetId);
  if (!account)
    return (
      <p
        role={'alert'}
      >
        해당 조회 월의 통장 정보를 찾을 수 없어요.
      </p>
    );

  return (
    <>
      <BankAccountDetails
        key={`${userId}-${propertyId}-${month}-${accountId}-${account.id}`}
        propertyId={propertyId}
        account={account}
        month={month}
        onInitial={data?.initialCorrectionAllowed === true && account.status === 'ACTIVE'
          ? () => openPanel('initial', account.id) : undefined}
        onHistory={() => openPanel('history', account.id)}
      />
      <div
        className={styles['account-actions']}
        role={'group'}
        aria-label={'통장 관리'}
      >
        <Button
          variant={'outline'}
          disabled={account.status !== 'ACTIVE'}
          onClick={() => onEdit(account.id)}
        >
          통장 정보 수정
        </Button>
        <Button
          onClick={() => onTransactions(account.id)}
        >
          거래 내역 보기
        </Button>
      </div>
    </>
  );
}

/** 저장과 취소 후 기존 상세 대상으로 복귀하는 편집 UI입니다. */
export function BalanceAccountEditor({
  editingAccountId,
  propertyId,
  onClose,
  onSaved
}: BalanceAccountEditorProps) {
  if (!editingAccountId)
    return null;

  return (
    <BankAccountEditor
      key={editingAccountId}
      propertyId={propertyId}
      initialAccountId={editingAccountId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
