import { useState } from 'react';
import {
  useMutation,
  useQueryClient
} from '@tanstack/react-query';
import type { BillingCharge } from '@/entities/billing';
import { UnitDeleteConfirmation } from '@/entities/property';
import {
  cancelBillingCharge,
  getBillingError
} from '@/features/billing-management';
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

/** 저장된 상세를 표시하고 당월 개별 청구에만 확인 절차를 거쳐 취소를 허용합니다. */
export function BillingDetail({
  propertyId,
  canCancel = false,
  month,
  charges,
  hasBuildings,
  upcoming = false,
  presentation = 'modal',
  onClose,
}: {
  propertyId?: string;
  canCancel?: boolean;
  month: string;
  charges: BillingCharge[];
  hasBuildings: boolean;
  upcoming?: boolean;
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const unit = charges.length === 1 ? charges[0] : null;
  const cancellable = Boolean(propertyId && unit && canCancel && !upcoming);
  const cancellation = useMutation({
    mutationFn: async () => {
      if (!propertyId || !unit || !cancellable) return;
      await cancelBillingCharge(propertyId, month, unit.id);
    },
    onSuccess: async () => {
      // 월별 목록과 이력의 건수·합계를 재조회해 취소된 청구가 화면에 남지 않게 합니다.
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'billing' && query.queryKey[2] === propertyId
      });
      onClose();
    }
  });
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
          disabled={cancellation.isPending}
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
        {upcoming ? '부과 예정 금액으로, 해당 월 적용 설정을 기준으로 표시합니다.' : cancellable ? '당월 청구를 삭제하면 이번 달 부과에서 제외됩니다. 세대와 주민 정보는 유지됩니다.' : '과거 확정 내역은 보존됩니다.'}
      </p>
    </div>
    {(presentation === 'page' || cancellable) && (
      <footer
        className={styles.footer}
      >
        {cancellable && (
          <Button
            variant={'outline'}
            tone={'danger'}
            disabled={cancellation.isPending}
            onClick={() => { cancellation.reset(); setConfirming(true); }}
          >
            청구 삭제
          </Button>
        )}
        {presentation === 'page' && (
          <Button
            variant={'outline'}
            disabled={cancellation.isPending}
            onClick={onClose}
          >
            목록
          </Button>
        )}
      </footer>
    )}
    {confirming && unit && (
      <UnitDeleteConfirmation
        title={'청구 삭제 확인'}
        label={`${formatBillingMonth(month)} ${unit.building} ${unit.room}호 청구`}
        description={'이번 달 청구만 취소하고 처리 이력을 보존합니다. 세대·주민 정보와 과거 청구는 유지되며 다음 달에는 정상 부과됩니다.'}
        busy={cancellation.isPending}
        errorMessage={cancellation.isError ? getBillingError(cancellation.error) : ''}
        onConfirm={() => { if (!cancellation.isPending) cancellation.mutate(); }}
        onClose={() => setConfirming(false)}
      />
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
      busy={cancellation.isPending}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
