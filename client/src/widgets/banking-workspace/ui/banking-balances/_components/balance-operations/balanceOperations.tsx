'use client';

import { useBalanceActionDialog } from './_hooks/useBalanceOperations';
import { LoadingState } from '@/shared/ui/state-message';
import { balanceError } from '../../../../api/bankingBalanceApi';
import { DetailDialog } from '../balance-common/balanceCommon';
import type { BalanceActionDialogProps } from '../../_types/balancePanelTypes';
import { BalanceOperationFields } from './balanceOperationFields';
import { useBalanceOperationsDialog } from './_hooks/useBalanceOperations';
import { Button } from '@/shared/ui/button';
import { getBankAccountLabel } from '@/entities/banking';
import {
  AmountInput,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { getBalanceSummary } from '../../../../model/balanceLedger';
import { sortExpenseLabels } from '../../../../model/expenseAllocation';
import { PagedTable } from '../balance-common/balanceCommon';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './balanceOperations.module.css';

/** 기존 기준 잔고 화면 안에서 통장을 선택하고 해당 통장의 동별 입력을 불러옵니다. */
export function BalanceActionDialog(props: BalanceActionDialogProps) {
  const state = useBalanceActionDialog(props);

  if (state.kind === 'unscoped') {
    const {
      props
    } = state;

    return (
      <BalanceOperationsDialog
        {...props}
      />
    );
  }

  const selector = (
    <SelectDropdown
      label={'통장 선택'}
      value={state.accountId}
      onChange={state.setAccountId}
      options={state.accounts.map((account) => ({
        value: account.id,
        label: getBankAccountLabel(account)
      }))}
    />
  );
  if (state.kind === 'loading') {
    const {
      props,
      query
    } = state;

    return (
      <DetailDialog
        title={'기준 잔고 확인'}
        presentation={props.presentation}
        onClose={props.onClose}
      >
        {selector}
        {query.isPending ? (
          <LoadingState
            title={'선택한 통장의 동별 기준 잔고를 불러오고 있어요.'}
            layout={'inline'}
          />
        ) : (
          <p
            role={'alert'}
          >
            {balanceError(query.error)}
          </p>
        )}
      </DetailDialog>
    );
  }

  const {
    accountId,
    openingDrafts,
    rememberOpening,
    query
  } = state;

  return (
    <BalanceOperationsDialog
      key={accountId}
      {...props}
      data={query.data}
      openingAccountId={accountId}
      openingSelector={selector}
      openingDraft={openingDrafts[accountId]}
      onOpeningDraftChange={rememberOpening}
    />
  );
}

export function BalanceOperationsDialog({
  action,
  data,
  propertyId,
  onClose,
  onSaved,
  presentation = 'modal',
  openingSelector,
  openingAccountId,
  openingDraft: cachedOpening,
  onOpeningDraftChange
}: BalanceActionDialogProps) {
  const state = useBalanceOperationsDialog({
    action,
    data,
    propertyId,
    onClose,
    onSaved,
    presentation,
    openingSelector,
    openingAccountId,
    openingDraft: cachedOpening,
    onOpeningDraftChange
  });

  if (state.kind === 'missing') {
    const {
      onClose,
      presentation,
      title
    } = state;

    return (
      <DetailDialog
        title={title}
        presentation={presentation}
        onClose={onClose}
      >
        <p>
          해당 내역을 찾을 수 없습니다.
        </p>
      </DetailDialog>
    );
  }

  if (state.kind === 'deleting') {
    const {
      onClose,
      presentation,
      error,
      setError,
      busy,
      setDeleting,
      external,
      deleteExternalTransaction
    } = state;

    return (
      <DetailDialog
        title={'거래를 삭제할까요?'}
        presentation={presentation}
        onClose={onClose}
        busy={busy}
        compact
        footer={(
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              tone={'neutral'}
              disabled={busy}
              onClick={() => {
                setDeleting(false);
                setError('');
              }}
            >
              취소
            </Button>
            <Button
              tone={'danger'}
              loading={busy}
              disabled={busy}
              onClick={() => {
                void deleteExternalTransaction();
              }}
            >
              삭제
            </Button>
          </div>
        )}
      >
        <div
          className={styles.form}
        >
          <h3>
            {external.expenseName}
          </h3>
          <p>
            {external.date}
            {' · 출금 '}
            {formatBalanceMoney(external.transactionAmount ?? null)}
          </p>
          <p>
            외부 부담금
            {' '}
            {formatBalanceMoney(external.amount)}
            과 이 출금에 연결된 모든 동별 지출을 계산에서 제거합니다. 처리 이력은 보관됩니다.
          </p>
          {BigInt(external.received) > BigInt(0) && (
            <p
              className={styles.muted}
            >
              연결한 회수 입금은 삭제하지 않고 다른 정산에 사용할 수 있도록 되돌립니다.
            </p>
          )}
          {error && (
            <p
              role={'alert'}
              className={styles.error}
            >
              {error}
            </p>
          )}
        </div>
      </DetailDialog>
    );
  }

  const {
    cutoff,
    amounts,
    setAmounts,
    editingOpening,
    setEditingOpening,
    correctionReason,
    setCorrectionReason,
    payment,
    setPayment,
    building,
    setBuilding,
    amount,
    setAmount,
    error,
    setError,
    busy,
    decisionBusy,
    setDeleting,
    missing,
    setOpeningBuilding,
    registeredOpenings,
    openingTargets,
    inputOpening,
    openingOptions,
    selectedOpening,
    enteredCount,
    external,
    income,
    options,
    title,
    submit,
    changeSettlementTarget
  } = state;

  return (
    <DetailDialog
      title={title}
      presentation={presentation}
      onClose={onClose}
      busy={busy}
      compact={action.kind !== 'difference' && action.kind !== 'opening'}
      className={action.kind === 'opening' ? styles['opening-dialog'] : undefined}
      footer={(
        action.kind !== 'difference' && (action.kind !== 'opening' || data.initialCorrectionAllowed !== false) && (
          <div
            className={styles.actions}
          >
            {action.kind === 'opening' && !inputOpening && data.initialCorrectionAllowed !== false && (
              <Button
                onClick={() => setEditingOpening(true)}
              >
                기준 잔고 수정
              </Button>
            )}
            {action.kind === 'opening' && editingOpening && (
              <Button
                variant={'outline'}
                tone={'neutral'}
                disabled={busy}
                onClick={() => {
                  setEditingOpening(false);
                  setAmounts(Object.fromEntries(registeredOpenings.map((row) => [row.id, row.openingBalance!])));
                  setError('');
                }}
              >
                취소
              </Button>
            )}
            {action.kind === 'settlement' && external && (
              <Button
                variant={'outline'}
                tone={'neutral'}
                loading={decisionBusy}
                disabled={busy}
                onClick={() => {
                  void changeSettlementTarget();
                }}
              >
                {external.excluded ? '정산 대상으로 복원' : '정산에서 제외'}
              </Button>
            )}
            {action.kind === 'settlement' && external?.transactionId && (
              <Button
                variant={'outline'}
                tone={'danger'}
                disabled={busy}
                onClick={() => {
                  setDeleting(true);
                  setError('');
                }}
                leadingIcon={(
                  <ServiceIcon
                    name={'trash'}
                  />
                )}
              >
                거래 삭제
              </Button>
            )}
            {(action.kind !== 'opening' || inputOpening) && (action.kind !== 'opening' || data.initialCorrectionAllowed !== false) && (action.kind !== 'settlement' || (external && !external.excluded && BigInt(external.remaining) > BigInt(0))) && (
              <Button
                loading={busy && !decisionBusy}
                disabled={busy || (action.kind === 'settlement' && !options.length)}
                onClick={() => {
                  void submit();
                }}
              >
                {action.kind === 'settlement' ? '입금 연결 확정' : editingOpening ? '저장' : '확정'}
              </Button>
            )}
          </div>
        )
      )}
    >
      <BalanceOperationFields
        {...{
          action,
          data,
          openingSelector,
          cutoff,
          amounts,
          setAmounts,
          editingOpening,
          correctionReason,
          setCorrectionReason,
          busy,
          missing,
          setOpeningBuilding,
          openingTargets,
          inputOpening,
          openingOptions,
          selectedOpening,
          enteredCount
        }}
      />
      {action.kind === 'settlement' && external && (
        <fieldset
          className={styles.form}
          disabled={busy}
        >
          <h3>
            {external.label}
            {' '}
            ·
            {' '}
            {external.expenseName}
          </h3>
          <dl
            className={styles.overview}
          >
            <div>
              <dt>
                부담액
              </dt>
              <dd>
                {formatBalanceMoney(external.amount)}
              </dd>
            </div>
            <div>
              <dt>
                회수액
              </dt>
              <dd>
                {formatBalanceMoney(external.received)}
              </dd>
            </div>
            <div>
              <dt>
                남은 금액
              </dt>
              <dd>
                {formatBalanceMoney(external.remaining)}
              </dd>
            </div>
          </dl>
          {external.recoveries.length > 0 && (
            <ul
              className={styles.recoveries}
            >
              {external.recoveries.map((r) => (
                <li
                  key={r.id}
                >
                  {r.date}
                  {' '}
                  ·
                  {' '}
                  {r.payer}
                  <strong>
                    {formatBalanceMoney(r.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
          {external.excluded && (
            <p
              className={styles['exclusion-note']}
            >
              정산에서 제외한 내역입니다. 통장 거래·지출 원본과 회수 기록은 유지되며, 남은 금액은 미회수 합계에 포함하지 않습니다.
            </p>
          )}
          {!external.excluded && BigInt(external.remaining) > BigInt(0) && (
            <>
              <SelectDropdown
                label={'연결할 입금·외부 보관금'}
                value={payment}
                onChange={(value) => {
                  setPayment(value);
                  const available = BigInt(options.find((i) => i.id === value)!.available);
                  setAmount((available < BigInt(external.remaining) ? available : BigInt(external.remaining)).toString());
                }}
                options={options.map((i) => ({
                  value: i.id,
                  label: `${i.date} · ${i.payer} · 잔여 ${formatBalanceMoney(i.available)}`
                }))}
              />
              <AmountInput
                label={'연결 금액'}
                value={amount}
                onChange={setAmount}
              />
              {!options.length && (
                <p
                  className={styles.muted}
                >
                  연결 가능한 기타 입금이 없습니다. 통장 거래에서 실제 입금을 기타 입금으로 확정한 뒤 연결해주세요.
                </p>
              )}
            </>
          )}
        </fieldset>
      )}
      {action.kind === 'assignment' && income && (
        <fieldset
          className={styles.form}
          disabled={busy}
        >
          <p>
            {income.date}
            {' '}
            ·
            {' '}
            {income.payer}
            {' '}
            ·
            {' '}
            {formatBalanceMoney(income.amount)}
          </p>
          <p
            className={styles.muted}
          >
            연결 세대:
            {income.linkedUnitLabel ?? '세대 미확인'}
            {' '}
            · 현재 정보이므로 입금 당시 동을 확인해주세요.
          </p>
          <SelectDropdown
            label={'귀속 동'}
            value={building}
            onChange={setBuilding}
            options={sortExpenseLabels(data.buildings.filter((b) => b.active)).map((b) => ({
              value: b.id,
              label: b.label
            }))}
          />
          <p
            className={styles.muted}
          >
            당시 실제 입금이 속한 동을 확인해주세요. 확정 후에는 다른 동으로 덮어쓰지 않습니다.
          </p>
        </fieldset>
      )}
      {action.kind === 'difference' && (
        <>
          <p>
            통장 장부 잔액과 동별 잔고 합계의 차이입니다.
          </p>
          <dl
            className={styles.overview}
          >
            <div>
              <dt>
                통장 장부 잔액 − 동별 합계
              </dt>
              <dd
                data-negative={getBalanceSummary(data).difference !== null && getBalanceSummary(data).difference! < BigInt(0)}
              >
                {formatBalanceMoney(getBalanceSummary(data).difference)}
              </dd>
            </div>
            <div>
              <dt>
                외부 보관금 잔액
              </dt>
              <dd>
                {formatBalanceMoney(data.incomes.filter((i) => i.kind === 'EXTERNAL').reduce((sum, i) => sum + BigInt(i.available), BigInt(0)))}
              </dd>
            </div>
            <div>
              <dt>
                조회 기간 외부 대납 미회수액
              </dt>
              <dd>
                {formatBalanceMoney(getBalanceSummary(data).external)}
              </dd>
            </div>
          </dl>
          <h3>
            처리 전 은행 거래
          </h3>
          <PagedTable
            label={'처리 전 은행 거래'}
            rows={data.pending}
            columns={[{
              key: 'date',
              header: '거래일',
              render: (r) => r.date
            }, {
              key: 'label',
              header: '입금자·지출명',
              render: (r) => r.label
            }, {
              key: 'amount',
              header: '금액',
              render: (r) => `${r.direction === 'EXPENSE' ? '출금' : '입금'} ${formatBalanceMoney(r.amount)}`
            }]}
          />
          <h3>
            귀속 확인할 입금
          </h3>
          <PagedTable
            label={'귀속 확인할 입금'}
            rows={data.incomes.filter((i) => i.kind !== 'EXTERNAL' && BigInt(i.available) > BigInt(0))}
            columns={[{
              key: 'date',
              header: '입금일',
              render: (r) => r.date
            }, {
              key: 'payer',
              header: '입금자',
              render: (r) => r.payer
            }, {
              key: 'amount',
              header: '미귀속 금액',
              render: (r) => formatBalanceMoney(r.available)
            }]}
          />
        </>
      )}
      {error && (
        <p
          role={'alert'}
          className={styles.error}
        >
          {error}
        </p>
      )}

    </DetailDialog>
  );
}