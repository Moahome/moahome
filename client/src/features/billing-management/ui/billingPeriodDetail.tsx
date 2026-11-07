'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BillingDetail,
  sumBillingItems
} from '@/entities/billing';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { getBillingMonth } from '../api/billingApi';
import styles from './billingPeriodDetail.module.css';

/** 원장에 포함된 확정 부과 항목만 기존 부과 상세에 전달하고 세대별 미납액과 섞지 않습니다. */
export function BillingPeriodDetail({ propertyId, month, itemIds, expectedAmount, presentation, onClose }: {
  propertyId: string;
  month: string;
  itemIds: readonly string[];
  expectedAmount: string;
  presentation: 'modal' | 'page';
  onClose: () => void;
}) {
  const session = useSession();
  const query = useQuery({
    queryKey: ['billing', session.data?.id, propertyId, `month:${month}:`],
    queryFn: ({ signal }) => getBillingMonth(propertyId, month, undefined, signal),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always'
  });
  const selected = new Set(itemIds);
  const charges = (query.data?.charges ?? []).map((charge) => ({
    ...charge,
    items: charge.items.filter((item) => selected.has(item.id))
  })).filter((charge) => charge.items.length > 0);
  const found = new Set(charges.flatMap((charge) => charge.items.map((item) => item.id)));
  const amount = charges.reduce((sum, charge) => sum + sumBillingItems(charge.items), BigInt(0));
  const matched = query.data?.status === 'ISSUED' && found.size === selected.size && amount === BigInt(expectedAmount);
  if (!query.isPending && !query.isError && matched) return (
    <BillingDetail
      month={month}
      charges={charges}
      hasBuildings={query.data!.hasBuildings}
      presentation={presentation}
      onClose={onClose}
    />
  );
  let state = (
    <StateMessage
      variant={'review-required'}
      layout={'inline'}
      title={'부과 내역을 다시 확인해주세요.'}
      description={'조회 후 부과 자료가 변경되었습니다. 원장과 부과 내역을 다시 조회해주세요.'}
      actions={(
        <Button
          onClick={() => void query.refetch()}
        >
          다시 시도
        </Button>
      )}
    />
  );
  if (query.isPending) state = (
    <LoadingState
      title={'부과 내역을 불러오고 있어요.'}
    />
  );
  if (query.isError) state = (
    <RequestError
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );
  const content = (
    <>
      <header
        className={styles.header}
      >
        <h2
          id={'billing-period-state-title'}
        >
          {month}
          {' '}
          부과 상세
        </h2>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
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
      {state}
    </>
  );
  if (presentation === 'page') return (
    <section
      className={styles.page}
    >
      {content}
    </section>
  );
  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'billing-period-state-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
