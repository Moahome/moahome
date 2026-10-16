'use client';

import { useState } from 'react';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import {
  getPreviewDuplicateCandidates,
  getPreviewChargeLabel,
  getPreviewDueDate,
  getPreviewBilledUnits,
  getPreviewOutstanding,
  getPreviewReceivables,
  recommendPreviewAllocation,
  type PreviewDraft,
  type PreviewPayment
} from '../../../model/paymentPreview';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import styles from './paymentEditor.module.css';

export function getPaymentStatusLabel(payment: PreviewPayment): string {
  const labels = {
    PENDING: '확인 필요',
    ON_HOLD: '보류',
    CONFIRMED: '확정',
    CANCELED: '취소',
    LINKED: '기존 수납 연결'
  };

  return labels[payment.status];
}

/** 입력값은 초안으로 유지하고 확정 순간의 최신 원장으로 다시 검증합니다. */
export function PaymentEditor({ paymentId, onProcessed }: {
  paymentId: string; onProcessed?: (id: string, status: PreviewPayment['status']) => void;
}) {
  const { ledger, update, busy } = usePaymentWorkspace();
  const payment = ledger.payments.find((item) => item.id === paymentId)!;
  const billedUnits = getPreviewBilledUnits(ledger, payment.date.slice(0, 7));
  const [draft, setDraft] = useState<PreviewDraft>({
    unitId: billedUnits.some((unit) => unit.id === payment.unitId) ? payment.unitId : '',
    allocations: []
  });
  const [error, setError] = useState('');
  const [action, setAction] = useState<'confirm' | 'cancel' | 'hold' | string | null>(null);
  const [reason, setReason] = useState('');
  const pending = payment.status === 'PENDING';
  const unitId = pending ? draft.unitId : payment.unitId;
  const receivables = getPreviewReceivables(ledger, unitId);
  const allocations = pending ? draft.allocations : payment.allocations;
  const validNumbers = allocations.every((item) => /^[0-9]+$/.test(item.amount));
  const total = validNumbers ? allocations.reduce((sum, item) => sum + BigInt(item.amount), BigInt(0)) : null;
  const unallocated = total === null ? null : BigInt(payment.amount) - total;
  const outstanding = receivables.reduce((sum, charge) => sum + getPreviewOutstanding(ledger, charge), BigInt(0));
  const candidates = getPreviewDuplicateCandidates(ledger, payment);
  const linkedBank = ledger.payments.find((item) => item.bankTransactionId === payment.bankTransactionId && item.linkedPaymentId === payment.id);
  const excluded = ledger.charges.filter((charge) => charge.unitId === unitId && (charge.status !== 'ISSUED' || BigInt(charge.amount) <= BigInt(0)));

  function changeAmount(chargeId: string, amount: string) {
    setError('');
    setDraft((current) => ({
      ...current,
      allocations: [
        ...current.allocations.filter((item) => item.chargeId !== chargeId), {
          chargeId,
          amount
        }
      ]
    }));
  }

  /** 보류·취소·원본 연결도 별도 확인창에서 검토하며 실패하면 현재 초안을 보존합니다. */
  async function performAction() {
    let failure: string | null = null;
    if (action === 'confirm') failure = await update({
      type: 'confirm',
      id: paymentId,
      data: draft
    }, '수납을 확정했어요.');
    else if (action === 'cancel') failure = await update({
      type: 'cancel',
      id: paymentId,
      data: {
        reason
      }
    }, '수납을 취소하고 납부 합계를 갱신했어요.');
    else if (action === 'hold') failure = await update({
      type: 'hold',
      id: paymentId,
      data: {
        reason
      }
    }, '입금을 보류했어요.');
    else if (action?.startsWith('link:')) failure = await update({
      type: 'link',
      id: paymentId,
      data: {
        paymentId: action.slice(5)
      }
    }, '기존 수납에 연결했어요. 수납액은 그대로입니다.');
    if (failure) { setError(failure); return; }
    setError('');
    setAction(null);
    if (action === 'confirm') onProcessed?.(paymentId, 'CONFIRMED');
    if (action === 'cancel') onProcessed?.(paymentId, 'CANCELED');
    if (action === 'hold') onProcessed?.(paymentId, 'ON_HOLD');
    if (action?.startsWith('link:')) onProcessed?.(action.slice(5), 'CONFIRMED');
  }

  function openAction(next: string) {
    setReason('');
    setError('');
    setAction(next);
  }

  return (
    <section
      className={styles.editor}
      aria-label={'입금 처리 상세'}
    >
      <header
        className={styles.heading}
      >
        <div>
          <p>
            {payment.source === 'MANUAL' ? '수동 등록' : '은행 업로드'}
          </p>
          <h2>
            {formatWon(payment.amount)}
          </h2>
        </div>
        <span
          className={styles.badge}
          data-status={payment.status}
        >
          {getPaymentStatusLabel(payment)}
        </span>
      </header>
      <section
        className={styles.source}
      >
        <h3>
          입금 원본
        </h3>
        <dl>
          <div>
            <dt>
              입금 계좌
            </dt>
            <dd>
              {ledger.accounts.find((item) => item.id === payment.accountId)?.label}
            </dd>
          </div>
          <div>
            <dt>
              입금일
            </dt>
            <dd>
              {payment.date.replaceAll('-', '.')}
            </dd>
          </div>
          <div>
            <dt>
              입금자명
            </dt>
            <dd>
              {payment.payer}
            </dd>
          </div>
          <div>
            <dt>
              은행 거래
            </dt>
            <dd>
              {payment.bankTransactionId ? '연결됨' : '미연결'}
            </dd>
          </div>
        </dl>
        {linkedBank && (
          <p>
            연결한 원본:
            {linkedBank.id}
            {' '}
            ·
            {linkedBank.date}
            {' '}
            ·
            {linkedBank.payer}
            {' '}
            ·
            {formatWon(linkedBank.amount)}
          </p>
        )}
        {payment.holdReason && (
          <p>
            보류 사유:
            {payment.holdReason}
          </p>
        )}
        {payment.cancelReason && (
          <p>
            취소 사유:
            {payment.cancelReason}
          </p>
        )}
      </section>
      {pending ? (
        <Dropdown
          label={'반영할 세대'}
          placeholder={'세대를 선택해주세요'}
          value={unitId}
          onChange={(value) => { setDraft({
            unitId: value,
            allocations: []
          }); setError(''); }}
          options={billedUnits.map((unit) => ({
            value: unit.id,
            label: unit.label
          }))}
        />
      )
        : (
          <p
            className={styles['unit-name']}
          >
            {ledger.units.find((unit) => unit.id === unitId)?.label ?? '세대 미지정'}
          </p>
        )}
      {candidates.length > 0 && (
        <section
          className={styles.duplicate}
          aria-label={'기존 수동 수납 후보'}
        >
          <h3>
            이미 처리한 수납인지 확인해주세요
          </h3>
          <p>
            같은 계좌·입금일·금액의 수동 수납이 있어요. 연결하면 다시 수납하지 않습니다.
          </p>
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
            >
              <strong>
                {candidate.unitId}
                호 ·
                {' '}
                {candidate.payer}
                {' '}
                ·
                {' '}
                {formatWon(candidate.amount)}
              </strong>
              <p>
                {candidate.date}
                {' '}
                ·
                {' '}
                {ledger.accounts.find((item) => item.id === candidate.accountId)?.label}
              </p>
              <Button
                variant={'outline'}
                size={'sm'}
                onClick={() => openAction(`link:${candidate.id}`)}
              >
                이 수납에 연결
              </Button>
            </div>
          ))}
          <Input
            label={'별도 입금이라면 확인 사유'}
            value={draft.separateReason ?? ''}
            onChange={(event) => setDraft((current) => ({
              ...current,
              separateReason: event.target.value
            }))}
            placeholder={'은행에서 별도 거래임을 확인한 근거'}
          />
        </section>
      )}
      <section
        className={styles.allocations}
      >
        <div
          className={styles['section-heading']}
        >
          <h3>
            몇 월 관리비로 반영할까요?
          </h3>
        </div>
        {pending && unitId && (
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() => { setDraft({
              ...recommendPreviewAllocation(ledger, payment, unitId),
              separateReason: draft.separateReason
            }); setError(''); }}
          >
            오래된 미납부터 추천
          </Button>
        )}
        {pending && receivables.map((charge) => {
          const amount = draft.allocations.find((item) => item.chargeId === charge.id)?.amount ?? '0';
          const balance = getPreviewOutstanding(ledger, charge);
          const after = /^[0-9]+$/.test(amount) ? balance - BigInt(amount) : null;

          return (
            <div
              key={charge.id}
              className={styles['allocation-row']}
            >
              <div>
                <strong>
                  {charge.month.replace('-', '년 ')}
                  월
                </strong>
                <p>
                  납부기한
                  {' '}
                  {getPreviewDueDate(charge.month)}
                </p>
                <p>
                  남은 청구액
                  {' '}
                  {formatWon(balance)}
                </p>
              </div>
              <AmountInput
                label={`${charge.month} 반영액`}
                value={amount}
                onChange={(value) => changeAmount(charge.id, value)}
                trailingContent={'원'}
              />
              <p
                className={styles.after}
                data-invalid={after !== null && after < BigInt(0)}
              >
                반영 후 잔액
                {' '}
                {after === null ? '—' : formatWon(after)}
              </p>
            </div>
          );
        })}
        {pending && receivables.length === 0 && (
          <p
            className={styles.empty}
          >
            {unitId ? '반영할 양수 미납 청구가 없어요.' : '세대를 선택하면 남은 청구를 확인할 수 있어요.'}
          </p>
        )}
        {!pending && allocations.map((allocation) => (
          <div
            key={allocation.chargeId}
            className={styles['result-row']}
          >
            <span>
              {ledger.charges.find((charge) => charge.id === allocation.chargeId)?.month}
            </span>
            <strong>
              {formatWon(allocation.amount)}
            </strong>
          </div>
        ))}
        {excluded.map((charge) => (
          <p
            key={charge.id}
            className={styles.excluded}
          >
            {charge.month}
            {' '}
            ·
            {' '}
            {getPreviewChargeLabel(ledger, charge)}
            {' · '}
            {formatWon(charge.amount)}
            {' '}
            · 반영 대상 제외
          </p>
        ))}
        {payment.status === 'CANCELED' && (
          <p
            className={styles.excluded}
          >
            위 배분은 취소된 이력이며 현재 납부액에 포함되지 않습니다.
          </p>
        )}
      </section>
      <section
        className={styles.summary}
        aria-label={'반영 결과 미리보기'}
        aria-live={'polite'}
      >
        <div>
          <span>
            입금액
          </span>
          <strong>
            {formatWon(payment.amount)}
          </strong>
        </div>
        <div>
          <span>
            관리비 반영액
          </span>
          <strong>
            {total === null ? '—' : formatWon(total)}
          </strong>
        </div>
        {pending && (
          <div>
            <span>
              반영 후 세대 미납
            </span>
            <strong>
              {total === null ? '—' : formatWon(outstanding - total)}
            </strong>
          </div>
        )}
        <div
          className={styles.emphasis}
        >
          <span>
            선입금 잔액
          </span>
          <strong
            data-invalid={unallocated !== null && unallocated < BigInt(0)}
          >
            {unallocated === null ? '—' : formatWon(unallocated)}
          </strong>
        </div>
        {unallocated !== null && unallocated > BigInt(0) && (
          <p>
            청구에 반영하고 남은 입금은 선입금 잔액으로 추적합니다.
          </p>
        )}
      </section>
      {error && !action && (
        <p
          role={'alert'}
          className={styles.error}
        >
          {error}
        </p>
      )}
      <div
        className={styles.actions}
      >
        {pending && (
          <Button
            disabled={busy || !unitId || total === null || total <= BigInt(0) || unallocated === null || unallocated < BigInt(0) || (candidates.length > 0 && !draft.separateReason?.trim())}
            onClick={() => openAction('confirm')}
          >
            배분 확정
          </Button>
        )}
        {pending && payment.source === 'BANK_IMPORT' && (
          <Button
            variant={'outline'}
            onClick={() => openAction('hold')}
          >
            보류
          </Button>
        )}
        {payment.status === 'ON_HOLD' && (
          <Button
            onClick={async () => { const failure = await update({
              type: 'resume',
              id: paymentId
            }, '다시 검토할 수 있어요.'); if (failure) { setError(failure); return; } onProcessed?.(paymentId, 'PENDING'); }}
          >
            보류 해제
          </Button>
        )}
        {payment.status === 'CONFIRMED' && (
          <Button
            variant={'outline'}
            tone={'danger'}
            onClick={() => openAction('cancel')}
          >
            수납 취소
          </Button>
        )}
      </div>
      {action && (
        <ClientModal
          className={styles.modal}
          onClose={() => { setAction(null); setError(''); }}
          busy={busy}
          aria-labelledby={'payment-action-title'}
        >
          <div
            className={styles['modal-header']}
          >
            <h2
              id={'payment-action-title'}
            >
              {action === 'confirm' ? '이 내용으로 반영할까요?' : action === 'cancel' ? '수납을 취소할까요?' : action === 'hold' ? '입금을 보류할까요?' : '기존 수납에 연결할까요?'}
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              size={'sm'}
              aria-label={'처리 확인 닫기'}
              disabled={busy}
              onClick={() => { setAction(null); setError(''); }}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          </div>
          <p>
            {payment.payer}
            {' '}
            ·
            {' '}
            {payment.date}
            {' '}
            ·
            {' '}
            {formatWon(payment.amount)}
          </p>
          {action === 'confirm' && (
            <>
              <p>
                관리비 반영
                {total === null ? '—' : formatWon(total)}
                {' '}
                · 선입금
                {unallocated === null ? '—' : formatWon(unallocated)}
              </p>
              <p>
                확정하면 실제 수납과 청구월별 반영액이 저장됩니다.
              </p>
            </>
          )}
          {action?.startsWith('link:') && (
            <p>
              은행 원본을 기존 수납에 연결합니다. 수납액과 월별 반영액은 늘어나지 않습니다.
            </p>
          )}
          {(action === 'cancel' || action === 'hold') && (
            <Input
              label={action === 'cancel' ? '취소 사유' : '보류 사유'}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          )}
          {error && (
            <p
              role={'alert'}
              className={styles.error}
            >
              {error}
            </p>
          )}
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => { setAction(null); setError(''); }}
            >
              돌아가기
            </Button>
            <Button
              loading={busy}
              onClick={performAction}
            >
              확인
            </Button>
          </div>
        </ClientModal>
      )}
    </section>
  );
}
