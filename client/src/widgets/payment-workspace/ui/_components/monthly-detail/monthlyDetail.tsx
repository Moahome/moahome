'use client';

import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  usePathname,
  useRouter
} from 'next/navigation';
import {
  getConfirmedUnitReceipts,
  getMonthlyPreviewRows,
  getPreviewDueDate
} from '../../../model/paymentPreview';
import type { MonthlyPreviewRow } from '../../../model/paymentPreviewTypes';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import {
  MONTHLY_STATUS_TONES,
  PaymentBadge
} from '../payment-badge/paymentBadge';
import styles from './monthlyDetail.module.css';

/** 미수·수납을 구분해 핵심 금액을 고르며 정산 미확정 부과를 납부완료나 선입금으로 표현하지 않습니다. */
function getDetailSummary(row: MonthlyPreviewRow) {
  if (row.settlementPending) return {
    label: '당월 부과금액',
    amount: row.billed + (row.settlementAmount ?? BigInt(0)),
    description: '0원·음수 부과의 정산 처리 여부를 확인해주세요.'
  };
  if (row.status === '납부완료') return {
    label: '당월 수납 반영액',
    amount: row.applied,
    description: '조회월 말 기준 남은 미납금액이 없습니다.'
  };

  return {
    label: '남은 미납금액',
    amount: row.balance,
    description: '관리비에 확정 반영된 수납액을 기준으로 계산합니다.'
  };
}

/** 월별 표의 원장 계산을 PC 모달과 모바일 상세 페이지에서 재사용합니다. */
export function MonthlyDetail({ month, unitId, presentation = 'modal', onClose }: {
  month: string;
  unitId: string;
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const { ledger, propertyId } = usePaymentWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const listPath = `/manage/${propertyId}/${pathname.includes('/banking/') ? 'banking' : 'payments'}/monthly`;
  const row = getMonthlyPreviewRows(ledger, month).find((item) => item.unitId === unitId);
  const receipts = getConfirmedUnitReceipts(ledger, unitId, month);
  // 누적 계산과 전체 건수는 유지하고 상세에는 최신 3건만 표시해 내역이 길어지지 않게 합니다.
  const recentReceipts = receipts.slice(0, 3);
  const summary = row ? getDetailSummary(row) : null;
  const billedAmount = row ? row.billed + (row.settlementAmount ?? BigInt(0)) : BigInt(0);
  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <p>
            {month}
            {' '}
            · 월별 수납 현황
          </p>
          <Title
            id={'monthly-detail-title'}
          >
            {row ? `${row.unitLabel} 수납 상세` : '세대를 찾을 수 없습니다.'}
          </Title>
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'수납 상세 닫기'}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      {row && summary && (
        <div
          className={styles.body}
        >
          <section
            className={styles.summary}
            data-tone={MONTHLY_STATUS_TONES[row.status]}
            aria-label={'수납 요약'}
          >
            <div
              className={styles['summary-heading']}
            >
              <p>
                {summary.label}
              </p>
              <PaymentBadge
                tone={MONTHLY_STATUS_TONES[row.status]}
              >
                {row.status}
              </PaymentBadge>
            </div>
            <strong
              className={styles['summary-amount']}
            >
              {formatWon(summary.amount)}
            </strong>
            <p
              className={styles['summary-description']}
            >
              {summary.description}
            </p>
            <p
              className={styles['due-date']}
            >
              <ServiceIcon
                name={'closing'}
                size={16}
              />
              납부기한
              {' '}
              <time
                dateTime={getPreviewDueDate(month)}
              >
                {getPreviewDueDate(month)}
              </time>
            </p>
          </section>
          <section
            className={styles['detail-section']}
            aria-labelledby={'monthly-calculation-title'}
          >
            <h3
              id={'monthly-calculation-title'}
            >
              미납금액 계산 내역
            </h3>
            <dl>
              <div>
                <dt>
                  전월 이월 미수금
                </dt>
                <dd>
                  {formatWon(row.carry)}
                </dd>
              </div>
              <div>
                <dt>
                  당월 관리비 발생액
                </dt>
                <dd>
                  {billedAmount >= BigInt(0) && '＋ '}
                  {formatWon(billedAmount)}
                </dd>
              </div>
              <div>
                <dt>
                  당월 수납 반영액
                </dt>
                <dd
                  className={styles['applied-amount']}
                >
                  −
                  {' '}
                  {formatWon(row.applied)}
                </dd>
              </div>
              <div
                className={styles.total}
              >
                <dt>
                  남은 미납금액
                </dt>
                <dd>
                  {!row.settlementPending ? formatWon(row.balance) : '정산 확인 필요'}
                </dd>
              </div>
            </dl>
          </section>
          <section
            className={styles['detail-section']}
            aria-labelledby={'monthly-payment-info-title'}
          >
            <div>
              <h3
                id={'monthly-payment-info-title'}
              >
                수납 정보
              </h3>
              {row.latestDate === '—' && (
                <PaymentBadge
                  tone={'neutral'}
                >
                  확정 수납 없음
                </PaymentBadge>
              )}
            </div>
            <dl>
              <div>
                <dt>
                  세대 대표
                </dt>
                <dd>
                  {row.representativeName}
                </dd>
              </div>
              <div>
                <dt>
                  최근 입금자
                </dt>
                <dd>
                  {row.latestPayer}
                </dd>
              </div>
              <div>
                <dt>
                  선입금 잔액
                </dt>
                <dd>
                  {formatWon(row.prepaid)}
                </dd>
              </div>
              <div>
                <dt>
                  최근 입금일
                </dt>
                <dd>
                  {row.latestDate}
                </dd>
              </div>
            </dl>
          </section>
          <section
            className={styles['detail-section']}
            aria-label={'최근 입금 내역'}
          >
            <div>
              <h3>
                최근 입금 내역
              </h3>
              <PaymentBadge
                tone={'neutral'}
              >
                {`전체 ${receipts.length}건`}
              </PaymentBadge>
            </div>
            {recentReceipts.length > 0 ? (
              <dl>
                {recentReceipts.map((payment) => (
                  <div
                    key={payment.id}
                  >
                    <dt>
                      {`${payment.date} · ${payment.payer}`}
                    </dt>
                    <dd>
                      {formatWon(payment.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p
                className={styles['empty-receipts']}
              >
                확정된 입금 내역이 없습니다.
              </p>
            )}
            <Button
              className={styles['receipt-history-button']}
              onClick={() => router.push(`${listPath}/${month}/${encodeURIComponent(unitId)}/receipts`)}
              trailingIcon={(
                <ServiceIcon
                  name={'arrow'}
                  size={16}
                />
              )}
            >
              전체 내역
            </Button>
          </section>
          <p
            className={styles.note}
          >
            <ServiceIcon
              name={'info'}
              size={16}
            />
            <span>
              세대에 확정한 입금 전액을 누적해 관리비와 비교합니다. 이전 선입금도 반영하며 초과분은 선입금 잔액으로 보관합니다.
            </span>
          </p>
        </div>
      )}
    </>
  );
  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'monthly-detail-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'monthly-detail-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
