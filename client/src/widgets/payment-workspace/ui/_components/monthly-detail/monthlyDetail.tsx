'use client';

import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  getMonthlyPreviewRows,
  getPreviewDueDate
} from '../../../model/paymentPreview';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import styles from './monthlyDetail.module.css';

/** 월별 표의 원장 계산을 PC 모달과 모바일 상세 페이지에서 재사용합니다. */
export function MonthlyDetail({ month, unitId, presentation = 'modal', onClose }: {
  month: string;
  unitId: string;
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const { ledger } = usePaymentWorkspace();
  const row = getMonthlyPreviewRows(ledger, month).find((item) => item.unitId === unitId);
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
      {row && (
        <div
          className={styles.body}
        >
          <div
            className={styles.status}
          >
            <strong>
              {row.status}
            </strong>
            <span>
              납부기한
              {' '}
              {getPreviewDueDate(month)}
            </span>
          </div>
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
                ＋ 당월 관리비 발생액
              </dt>
              <dd>
                {formatWon(row.billed + (row.settlementAmount ?? BigInt(0)))}
              </dd>
            </div>
            <div>
              <dt>
                − 당월 수납 반영액
              </dt>
              <dd>
                {formatWon(row.applied)}
              </dd>
            </div>
            <div
              className={styles.total}
            >
              <dt>
                당월 말 미수금
              </dt>
              <dd>
                {!row.settlementPending ? formatWon(row.balance) : '정산 확인 필요'}
              </dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>
                선입금 잔액
              </dt>
              <dd>
                {formatWon(row.prepaid)}
              </dd>
            </div>
          </dl>
          <p>
            최근 입금일
            {row.latestDate}
          </p>
          <p
            className={styles.note}
          >
            은행 입금 총액이 아닌 관리비에 실제 반영된 수납액으로 계산합니다. 초과입금은 선입금 잔액으로 보존하며 미수금이 음수가 되도록 차감하지 않습니다.
          </p>
        </div>
      )}
      {presentation === 'page' && (
        <footer
          className={styles.footer}
        >
          <Button
            variant={'outline'}
            onClick={onClose}
          >
            목록
          </Button>
        </footer>
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
