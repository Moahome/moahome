import type { BillingCharge } from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  formatBillingMonth,
  getBillingDates,
  getSortedBillingCharges,
  sumBillingItems,
} from '../../../model/billing';
import styles from './billingDetail.module.css';

/** 확정 이력과 부과 예정액은 읽기 전용으로 표시해 조회가 실제 청구 변경으로 이어지지 않게 합니다. */
export function BillingDetail({
  month,
  charges,
  hasBuildings,
  upcoming = false,
  presentation = 'modal',
  onClose,
}: {
  month: string;
  charges: BillingCharge[];
  hasBuildings: boolean;
  upcoming?: boolean;
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const unit = charges.length === 1 ? charges[0] : null;
  const dates = getBillingDates(month);
  const sortedCharges = getSortedBillingCharges(charges);
  const total = charges.reduce((sum, charge) => sum + sumBillingItems(charge.items), BigInt(0));
  const title = unit ? `${unit.building} ${unit.room.endsWith('호') ? unit.room : `${unit.room}호`} 관리비 상세`.trim() : `${formatBillingMonth(month)} 부과 상세`;

  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (<>
    <header
      className={styles.header}
    >
      <div>
        <p>
          {formatBillingMonth(month)}
          {' '}
          ·
          {' '}
          {upcoming ? '부과 예정' : '확정 내역'}
        </p>
        <Title
          id={'billing-detail-title'}
        >
          {title}
        </Title>
      </div>
      {presentation === 'modal' && (
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'상세 닫기'}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      )}
    </header>
    <div
      className={styles.body}
    >
      <dl
        className={styles.dates}
      >
        <div>
          <dt>
            부과일
          </dt>
          <dd>
            {dates.billingDate.replaceAll('-', '.')}
          </dd>
        </div>
        <div>
          <dt>
            납부기한
          </dt>
          <dd>
            {dates.dueDate.replaceAll('-', '.')}
          </dd>
        </div>
      </dl>
      {unit ? (
        <DataTable
          label={'청구 상세 항목'}
          rows={unit.items}
          getRowKey={(item) => item.id}
          minWidth={260}
          emptyState={'청구 항목이 없습니다.'}
          columns={[
            {
              key: 'name',
              header: '관리비 항목',
              rowHeader: true,
              render: (item) => item.name
            },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (item) => formatWon(item.amount)
            },
          ]}
        />
      ) : (
        <DataTable
          label={'확정 세대 내역'}
          rows={sortedCharges}
          getRowKey={(charge) => charge.id}
          minWidth={hasBuildings ? 360 : 280}
          emptyState={'부과 내역이 없습니다.'}
          columns={[
            ...(hasBuildings ? [{
              key: 'building',
              header: '동',
              render: (charge: BillingCharge) => charge.building || '—'
            }] : []),
            {
              key: 'room',
              header: '호수',
              rowHeader: true,
              render: (charge) => charge.room.endsWith('호') ? charge.room : `${charge.room}호`
            },
            {
              key: 'amount',
              header: '청구 금액',
              align: 'right',
              render: (charge) => formatWon(sumBillingItems(charge.items))
            },
          ]}
        />
      )}
      <div
        className={styles.total}
      >
        <span>
          청구 합계
        </span>
        <strong>
          {formatWon(total)}
        </strong>
      </div>
      <p
        className={styles.note}
      >
        {upcoming ? '부과 예정 금액으로, 해당 월 적용 설정을 기준으로 표시합니다.' : '확정된 부과 내역은 읽기 전용으로 확인할 수 있습니다.'}
      </p>
    </div>
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
  </>);
  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'billing-detail-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'billing-detail-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
