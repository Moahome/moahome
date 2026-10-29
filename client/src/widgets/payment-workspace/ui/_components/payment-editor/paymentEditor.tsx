'use client';

import { IncomeAllocationSummary } from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  Input,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { StateIllustration } from '@/shared/ui/state-message';
import {
  useState,
  type ReactNode
} from 'react';
import {
  getCumulativePreviewBalance,
  getPreviewDuplicateCandidates,
  getPreviewSelectableUnits,
  getPreviewUnitSearchOptions
} from '../../../model/paymentPreview';
import type {
  CumulativePaymentDraft,
  PreviewPayment
} from '../../../model/paymentPreviewTypes';
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
export function PaymentEditor({ paymentId, onProcessed, disabled = false, children }: {
  children?: ReactNode;
  disabled?: boolean; paymentId: string; onProcessed?: (id: string, status: PreviewPayment['status'], receiptType?: PreviewPayment['receiptType']) => void;
}) {
  const { ledger, update, busy: workspaceBusy } = usePaymentWorkspace();
  const busy = workspaceBusy || disabled;
  const payment = ledger.payments.find((item) => item.id === paymentId)!;
  const selectableUnits = getPreviewSelectableUnits(ledger);
  const [draft, setDraft] = useState<CumulativePaymentDraft>({
    unitId: selectableUnits.some((unit) => unit.id === payment.unitId) ? payment.unitId : ''
  });
  const [error, setError] = useState<{ message: string; id: number } | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [receiptType, setReceiptType] = useState<'HOUSEHOLD' | 'OTHER'>(payment.receiptType ?? 'HOUSEHOLD');
  const [category, setCategory] = useState(payment.incomeCategory ?? '');
  const [note, setNote] = useState(payment.incomeNote ?? '');
  const otherIncome = receiptType === 'OTHER';
  const manualAllocation = payment.source === 'MANUAL' && !payment.bankTransactionId ? payment.incomeAllocation : null;
  const pending = payment.status === 'PENDING';
  const unitId = pending ? draft.unitId : payment.unitId;
  const totals = getCumulativePreviewBalance(ledger, unitId, pending && unitId ? payment.amount : '0');
  const candidates = getPreviewDuplicateCandidates(ledger, payment);
  const linkedBank = ledger.payments.find((item) => item.bankTransactionId === payment.bankTransactionId && item.linkedPaymentId === payment.id);

  /** 보류·삭제·원본 연결도 별도 확인창에서 검토하며 실패하면 현재 초안을 보존합니다. */
  async function performAction() {
    let failure: string | null = null;
    if (action === 'other-income') failure = await update({
      type: 'other-income',
      id: paymentId,
      data: {
        category: category.trim(),
        note: note.trim() || undefined
      }
    }, '기타 입금으로 확정했어요.');
    else if (action === 'confirm') failure = await update({
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
    }, otherIncome ? '기타 입금 확정을 취소했어요.' : '납부를 취소했어요.');
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
    if (failure) { setError((current) => ({
      message: failure,
      id: (current?.id ?? 0) + 1
    })); return; }
    setError(null);
    setAction(null);
    if (action === 'confirm' || action === 'other-income') onProcessed?.(paymentId, 'CONFIRMED', receiptType);
    if (action === 'cancel') onProcessed?.(paymentId, 'CANCELED');
    if (action === 'hold') onProcessed?.(paymentId, 'ON_HOLD');
    if (action?.startsWith('link:')) onProcessed?.(action.slice(5), 'CONFIRMED');
  }

  function openAction(next: string) {
    setReason('');
    setError(null);
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
          {payment.memo && <div>
            <dt>
              은행 메모
            </dt>
            <dd>
              {payment.memo}
            </dd>
          </div>}
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
      {pending && payment.source === 'BANK_IMPORT' && (
        <SelectDropdown
          label={'입금 분류'}
          value={receiptType}
          onChange={(value) => { setReceiptType(value as 'HOUSEHOLD' | 'OTHER'); setError(null); }}
          options={[{
            value: 'HOUSEHOLD',
            label: '세대 납부'
          }, {
            value: 'OTHER',
            label: '기타 입금'
          }]}
        />
      )}
      {otherIncome ? (
        <section
          className={styles['other-income']}
          aria-label={'기타 입금 분류'}
        >
          <h3>
            {pending ? '기타 입금' : '입금 분류'}
          </h3>
          {pending ? <>
            <Input
              label={'입금 항목'}
              value={category}
              maxLength={100}
              required
              placeholder={'예: 전기료, 예금이자'}
              onChange={(event) => setCategory(event.target.value)}
            />
            <Input
              label={'메모'}
              value={note}
              maxLength={500}
              placeholder={'입금 목적이나 확인한 내용을 남겨주세요'}
              onChange={(event) => setNote(event.target.value)}
            />
          </> : (
            <div
              className={styles.classification}
            >
              <div
                className={styles['classification-item']}
              >
                <span
                  className={styles['classification-icon']}
                >
                  <ServiceIcon
                    name={'receipt'}
                    size={22}
                  />
                </span>
                <dl>
                  <dt>
                    입금 항목
                  </dt>
                  <dd
                    className={styles.category}
                  >
                    <span>
                      기타 입금
                    </span>
                    <ServiceIcon
                      name={'chevron'}
                      direction={'right'}
                      size={16}
                    />
                    <strong>
                      {payment.incomeCategory || '—'}
                    </strong>
                  </dd>
                </dl>
              </div>
              <div
                className={styles['classification-item']}
              >
                <span
                  className={styles['classification-icon']}
                >
                  <ServiceIcon
                    name={'document'}
                    size={22}
                  />
                </span>
                <dl>
                  <dt>
                    메모
                  </dt>
                  <dd>
                    {payment.incomeNote || '등록된 메모가 없습니다.'}
                  </dd>
                </dl>
              </div>
            </div>
          )}
          {Boolean(manualAllocation?.allocations.length) && (
            <IncomeAllocationSummary
              total={payment.amount}
              allocations={manualAllocation!.allocations}
              active={payment.status === 'CONFIRMED'}
            />
          )}
          {pending && candidates.length > 0 && <p>
            같은 수동 수납이 있습니다. 세대 납부에서 기존 수납 연결 여부를 먼저 확인해주세요.
          </p>}
        </section>
      ) : pending ? (
        <SelectDropdown
          label={'반영할 세대'}
          placeholder={'이름 또는 동·호수로 검색'}
          value={unitId}
          onChange={(value) => { setDraft({
            unitId: value
          }); setError(null); }}
          options={getPreviewUnitSearchOptions(ledger)}
        />
      )
        : (
          <p
            className={styles['unit-name']}
          >
            {ledger.units.find((unit) => unit.id === unitId)?.label ?? '세대 미지정'}
          </p>
        )}
      {!otherIncome && candidates.length > 0 && (
        <section
          className={styles.duplicate}
          aria-label={'기존 수동 수납 후보'}
        >
          <StateIllustration
            variant={'review-required'}
            layout={'inline'}
          />
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
                {ledger.units.find((unit) => unit.id === candidate.unitId)?.label ?? '세대 확인 필요'}
                {' · '}
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
      {!otherIncome && (
        <section
          className={styles.summary}
          aria-label={'누적 수납 미리보기'}
          aria-live={'polite'}
        >
          <h3>
            세대 누적 수납
          </h3>
          <div>
            <span>
              누적 부과액
            </span>
            <strong>
              {formatWon(totals.billed)}
            </strong>
          </div>
          <div>
            <span>
              기존 누적 입금액
            </span>
            <strong>
              {formatWon(totals.received)}
            </strong>
          </div>
          {pending && <div>
            <span>
              이번 입금액
            </span>
            <strong>
              {formatWon(payment.amount)}
            </strong>
          </div>}
          <div>
            <span>
              {pending ? '반영 후 세대 미납' : '세대 미납'}
            </span>
            <strong>
              {formatWon(totals.balance)}
            </strong>
          </div>
          <div
            className={styles.emphasis}
          >
            <span>
              선입금 잔액
            </span>
            <strong>
              {formatWon(totals.prepaid)}
            </strong>
          </div>
          <p>
            입금 전액을 세대에 누적합니다. 미납이 없으면 선입금으로 보관하고 다음 관리비에 반영합니다.
          </p>
          {payment.status === 'CANCELED' && <p>
            취소된 입금은 누적 수납액에 포함되지 않습니다.
          </p>}
        </section>
      )}
      {children}
      {otherIncome && (
        <p
          className={styles['income-notice']}
        >
          <ServiceIcon
            name={'info'}
            size={17}
          />
          세대 관리비 납부액·미납액·선입금에 포함하지 않고 별도로 관리합니다.
        </p>
      )}
      <div
        className={[styles.actions, otherIncome && styles.footer].filter(Boolean).join(' ')}
      >
        {pending && (
          <Button
            disabled={busy || (otherIncome ? !category.trim() || candidates.length > 0 : !unitId || (candidates.length > 0 && !draft.separateReason?.trim()))}
            onClick={() => openAction(otherIncome ? 'other-income' : 'confirm')}
          >
            {otherIncome ? '기타 입금 확정' : '수납 확정'}
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
            }, '다시 검토할 수 있어요.'); if (failure) { setError((current) => ({
              message: failure,
              id: (current?.id ?? 0) + 1
            })); return; } onProcessed?.(paymentId, 'PENDING'); }}
          >
            보류 해제
          </Button>
        )}
        {payment.status === 'CONFIRMED' && (
          <Button
            variant={'outline'}
            tone={'danger'}
            disabled={busy}
            onClick={() => openAction('cancel')}
          >
            {otherIncome ? '확정 취소' : '납부 취소'}
          </Button>
        )}

      </div>
      {action && (
        <ClientModal
          className={styles.modal}
          onClose={() => { setAction(null); setError(null); }}
          busy={busy}
          aria-labelledby={'payment-action-title'}
        >
          <div
            className={styles['modal-header']}
          >
            <h2
              id={'payment-action-title'}
            >
              {action === 'other-income' ? '기타 입금으로 확정할까요?' : action === 'confirm' ? '이 내용으로 반영할까요?' : action === 'cancel' ? (otherIncome ? '기타 입금 확정을 취소할까요?' : '납부를 취소할까요?') : action === 'hold' ? '입금을 보류할까요?' : '기존 수납에 연결할까요?'}
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              size={'sm'}
              aria-label={'처리 확인 닫기'}
              disabled={busy}
              onClick={() => { setAction(null); setError(null); }}
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
            <p>
              {ledger.units.find((unit) => unit.id === unitId)?.label}
              에 입금 전액을 누적 반영합니다. 남는 금액은 선입금으로 보관합니다.
            </p>
          )}
          {action === 'other-income' && <p>
            {category.trim()}
            {' '}
            항목으로 기록합니다. 세대 납부에는 반영하지 않습니다.
          </p>}
          {action?.startsWith('link:') && (
            <p>
              은행 원본을 기존 수납에 연결합니다. 수납액과 월별 반영액은 늘어나지 않습니다.
            </p>
          )}
          {action === 'cancel' && <p>
            {otherIncome ? '기타 입금 합계에서 제외하고 은행 입금은 확인 필요로 돌아갑니다. 기존 분류는 취소 이력에 남습니다.' : '확정한 납부를 취소합니다. 수납 금액은 누적 합계에서 빠지고 은행 입금은 확인 필요로 돌아갑니다.'}
          </p>}
          {(action === 'hold' || action === 'cancel') && (
            <Input
              label={action === 'cancel' ? '취소 사유' : '보류 사유'}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          )}
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => { setAction(null); setError(null); }}
            >
              취소
            </Button>
            <Button
              loading={busy}
              variant={action === 'cancel' ? 'outline' : 'primary'}
              tone={action === 'cancel' ? 'danger' : undefined}
              onClick={performAction}
            >
              {action === 'cancel' ? (otherIncome ? '확정 취소' : '납부 취소') : '확인'}
            </Button>
          </div>
        </ClientModal>
      )}
      {error && (
        <Toast
          key={error.id}
          message={error.message}
          tone={'error'}
          onClose={() => setError(null)}
        />
      )}
    </section>
  );
}
