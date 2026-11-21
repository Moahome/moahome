'use client';

import { useBankInitialBalanceEditor } from './_hooks/useBalanceAccountPanels';
import { getBankAccountLabel } from '@/entities/banking';
import { LoadingState } from '@/shared/ui/state-message';
import { ApiError } from '@/shared/api';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { balanceError } from '../../../../api/bankingBalanceApi';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './bankInitialBalanceForm.module.css';

type Props = Pick<Extract<ReturnType<typeof useBankInitialBalanceEditor>, {
  kind: 'ready';
}> & Parameters<typeof useBankInitialBalanceEditor>[0], 'account' | 'data' | 'formId' | 'date' | 'setDate' | 'amount' | 'setAmount' | 'reason' | 'setReason' | 'error' | 'busy' | 'allowed' | 'dateChanged' | 'confirmedToken' | 'setConfirmedToken' | 'buildingAmounts' | 'setBuildingAmounts' | 'impact' | 'cash' | 'affectedBuildings' | 'buildingTotal' | 'needsConfirmation' | 'bankAmount' | 'buildingTotalExceeded' | 'submit'>;

/** BankInitialBalanceEditor 화면의 InitialEditor 표시 영역을 독립적으로 구성합니다. */
export function BankInitialBalanceForm({
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
}: Props) {
  return (<form
    id={formId}
    className={styles['initial-editor']}
    noValidate
    aria-busy={busy}
    onSubmit={submit}
          >
    <strong>
      {getBankAccountLabel(account)}
    </strong>
    <div
      className={styles['opening-metrics']}
    >
      <div
        role={'group'}
        aria-label={'초기 잔고 기준일'}
      >
        <span
          className={styles['opening-symbol']}
        >
          <ServiceIcon
            name={'closing'}
          />
        </span>
        <div>
          <span>
            잔고 기준일
          </span>
          <strong>
            {date || '미설정'}
          </strong>
        </div>
      </div>
      <div
        role={'group'}
        aria-label={'정정 기한'}
        data-locked={!allowed}
      >
        <span
          className={styles['opening-symbol']}
        >
          <ServiceIcon
            name={'clock'}
          />
        </span>
        <div>
          <span>
            정정 기한
          </span>
          <strong>
            {data.correctionDeadline ?? '확인 필요'}
          </strong>
        </div>
      </div>
    </div>
    {!allowed && (
      <p
        role={'status'}
      >
        초기 기준 정정이 잠겨 있습니다. 최초 첫 부과월 말일까지만 변경할 수 있습니다.
      </p>
    )}
    <p>
      기본 관리 통장의 기준일을 바꾸면 관리비 부과 시작월도 함께 맞춥니다. 금액만 정정하면 부과월은 유지합니다.
    </p>
    {data.buildings.length > 0 && cash.isPending && (
      <LoadingState
        title={'동별 시작 잔액을 확인하고 있어요.'}
        layout={'inline'}
      />
    )}
    {cash.isError && (
      <RequestError
        error={cash.error}
        onRetry={() => void cash.refetch()}
      />
    )}
    <fieldset
      className={styles['initial-fields']}
      disabled={busy || !allowed}
    >
      <CalendarPicker
        label={'초기 기준일'}
        value={date}
        onChange={setDate}
        required
      />
      <AmountInput
        label={'시작 잔액'}
        value={amount}
        onChange={setAmount}
      />
    </fieldset>
    {dateChanged && (
      <section
        className={styles['billing-impact']}
        aria-label={'관리비 부과 변경 확인'}
      >
        <h3>
          관리비 부과 변경 확인
        </h3>
        {impact.isPending && <p>
          부과 변경 내용을 확인하고 있어요.
        </p>}
        {impact.isError && (
          <RequestError
            error={impact.error}
            onRetry={() => void impact.refetch()}
          />
        )}
        {impact.data && (
          <>
            <p>
              {impact.data.primary
                ? `첫 부과월: ${impact.data.previousMonth} → ${impact.data.nextMonth}`
                : '기본 관리 통장이 아니므로 공통 관리비 부과월은 유지합니다.'}
            </p>
            {impact.data.missingMonths.map((row) => (
              <p
                key={row.month}
              >
                {row.month}
                {' '}
                ·
                {row.unitCount}
                세대 ·
                {formatWon(row.amount)}
                {' '}
                추가 부과
                {row.initialSettings ? ' · 초기 등록 기본 항목·금액 사용' : ''}
              </p>
            ))}
            {impact.data.blockedReason && (
              <p
                role={'alert'}
                className={styles.error}
              >
                {balanceError(new ApiError(409, impact.data.blockedReason, '기준일을 변경할 수 없습니다.'))}
              </p>
            )}
            {needsConfirmation && !impact.data.blockedReason && (
              <label>
                <input
                  type={'checkbox'}
                  checked={confirmedToken === impact.data.token}
                  onChange={(event) => setConfirmedToken(event.target.checked ? impact.data!.token : '')}
                />
                기존 인계 미납·선납과 중복되지 않음을 확인했고, 부과 변경을 함께 반영합니다.
              </label>
            )}
          </>
        )}
      </section>
    )}
    {affectedBuildings.length > 0 && (
      <fieldset
        className={styles['initial-fields']}
        disabled={busy || !allowed}
      >
        <legend>
          동별 시작 잔액
        </legend>
        <p
          className={styles.muted}
        >
          {date}
          {' '}
          기준으로 각 동의 금액도 함께 확인해주세요.
        </p>
        {affectedBuildings.map((row) => {
          const current = buildingAmounts[row.id] ?? row.openingBalance!;
          // 선택 동을 비워도 상한을 유지하도록 나머지 동의 합계만 따로 계산합니다.
          const others = affectedBuildings.filter((part) => part.id !== row.id)
            .map((part) => buildingAmounts[part.id] ?? part.openingBalance!);
          const maximum = bankAmount !== null && others.every((value) => /^-?[0-9]{1,15}$/.test(value))
            ? String(bankAmount - others.reduce((sum, value) => sum + BigInt(value), BigInt(0))) : undefined;
          const fillRemaining = maximum !== undefined && (current === '' || /^-?[0-9]{1,15}$/.test(current))
            ? BigInt(maximum) - BigInt(current || '0') : null;

          return (
            <div
              key={row.id}
              className={styles['building-opening-row']}
            >
              <AmountInput
                label={row.label}
                value={current}
                maxAmount={maximum}
                maxLength={20}
                onChange={(value) => setBuildingAmounts((previous) => ({
                  ...previous,
                  [row.id]: value
                }))}
                required
              />
              <Button
                variant={'outline'}
                aria-label={`${row.label} 남은 금액`}
                disabled={fillRemaining === null || fillRemaining <= BigInt(0)}
                onClick={() => {
                  if (maximum === undefined || fillRemaining === null || fillRemaining <= BigInt(0))
                    return;
                  setBuildingAmounts((previous) => ({
                    ...previous,
                    [row.id]: maximum
                  }));
                }}
              >
                남은 금액
              </Button>
            </div>
          );
        })}
        {buildingTotalExceeded && (
          <p
            role={'alert'}
            className={styles.error}
          >
            동별 합계는 통장 시작 잔액을 넘을 수 없습니다.
          </p>
        )}
        <dl
          className={styles.overview}
        >
          <div>
            <dt>
              동별 시작 잔액 합계
            </dt>
            <dd>
              {buildingTotal === null ? '입력 확인 필요' : formatBalanceMoney(buildingTotal)}
            </dd>
          </div>
          <div>
            <dt>
              통장 시작 잔액과 차이
            </dt>
            <dd>
              {buildingTotal === null || !/^[0-9]{1,15}$/.test(amount) ? '입력 확인 필요' : formatBalanceMoney(BigInt(amount) - buildingTotal)}
            </dd>
          </div>
        </dl>
      </fieldset>
    )}
    <Input
      label={'정정 사유'}
      required
      maxLength={500}
      value={reason}
      disabled={busy || !allowed}
      onChange={(event) => setReason(event.target.value)}
    />
    {error && (
      <p
        role={'alert'}
        className={styles.error}
      >
        {error}
      </p>
    )}
  </form>);
}