import type { BillingPeriod } from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { Input } from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatBillingMonth } from '../../../lib/billingLabel';
import {
  useBillingHistory,
  useBillingMonth
} from '../../_hooks/useBillingData';
import { BillingDetail } from '../billing-detail/billingDetail';
import { BillingLoadState } from '../billing-load-state/billingLoadState';
import styles from './billingHistory.module.css';

/** 실제 확정된 이력만 검색·페이지로 나누며 행 클릭은 웹 모달·모바일 페이지로 연결합니다. */
export function BillingHistory({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const list = useBillingHistory(propertyId);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailMonth, setDetailMonth] = useState<string | null>(null);
  const filtered = (list.data ?? []).filter((period) => (!filter || period.month === filter)
    && `${period.month} ${formatBillingMonth(period.month)}`.includes(query.trim()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function openDetail(period: BillingPeriod) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/billing/monthly/history/${period.month}`);
      return;
    }
    setDetailMonth(period.month);
  }
  if (list.isPending || list.isError) return (
    <BillingLoadState
      pending={list.isPending}
      error={list.error}
      onRetry={() => list.refetch()}
    />
  );

  return (
    <ListCard>
      <div
        className={styles.header}
      >
        <div>
          <h2>
            확정된 부과 이력
          </h2>
          <p>
            월별 자동 부과 결과와 세대별 청구 내역을 확인하세요.
          </p>
        </div>
        <MonthPicker
          label={'이력 조회 월'}
          value={filter}
          clearable
          onChange={(month) => { setFilter(month); setPage(1); }}
        />
      </div>
      <div
        className={styles.filters}
      >
        <Input
          aria-label={'부과 이력 검색'}
          placeholder={'부과월 검색 (예: 2026-10)'}
          value={query}
          leadingIcon={(
            <ServiceIcon
              name={'search'}
            />
          )}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
        />
        <Button
          variant={'outline'}
          disabled={!query && !filter}
          leadingIcon={(
            <ServiceIcon
              name={'reset'}
            />
          )}
          onClick={() => { setQuery(''); setFilter(''); setPage(1); }}
        >
          초기화
        </Button>
      </div>
      <ListToolbar
        total={filtered.length}
        unit={'건'}
        sizeLabel={'부과 이력 표시 개수'}
        pageSize={pageSize}
        onSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
      <DataTable
        label={'관리비 부과 이력'}
        rows={visible}
        getRowKey={(period) => period.month}
        minWidth={560}
        onRowClick={openDetail}
        emptyState={(
          <>
            <strong>
              {query || filter ? '검색 결과가 없어요.' : '확정된 부과 이력이 없어요.'}
            </strong>
            <p>
              검색 조건을 변경하거나 자동 부과 이후 내역을 확인해주세요.
            </p>
          </>
        )}
        columns={[
          {
            key: 'month',
            header: '부과월',
            rowHeader: true,
            render: (period) => (
              <button
                className={styles['detail-button']}
                type={'button'}
                aria-label={`${formatBillingMonth(period.month)} 부과 내역 보기`}
                onClick={() => openDetail(period)}
              >
                {formatBillingMonth(period.month)}
              </button>
            )
          },
          {
            key: 'units',
            header: '대상',
            render: (period) => `${period.unitCount}세대`
          },
          {
            key: 'due',
            header: '납부기한',
            render: (period) => period.dueDate.replaceAll('-', '.')
          },
          {
            key: 'total',
            header: '청구 합계',
            align: 'right',
            render: (period) => (
              <strong
                className={styles.amount}
              >
                {formatWon(period.totalAmount)}
              </strong>
            )
          },
          {
            key: 'status',
            header: '상태',
            render: () => (
              <span
                className={styles.badge}
              >
                자동 확정
              </span>
            )
          }
        ]}
      />
      <Pagination
        label={'부과 이력 페이지'}
        unit={'건'}
        total={filtered.length}
        page={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
      />
      <p
        className={styles.note}
      >
        확정된 청구는 관리비 설정을 변경해도 그대로 보존됩니다.
      </p>
      {detailMonth && (
        <PeriodDetail
          propertyId={propertyId}
          month={detailMonth}
          onClose={() => setDetailMonth(null)}
        />
      )}
    </ListCard>
  );
}
function PeriodDetail({ propertyId, month, onClose }: { propertyId: string; month: string; onClose: () => void }) {
  const list = useBillingMonth(propertyId, month);
  if (list.isPending || list.isError) return (
    <ClientModal
      className={styles['detail-state']}
      aria-labelledby={'billing-detail-state-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      <header
        className={styles['detail-state-header']}
      >
        <h2
          id={'billing-detail-state-title'}
        >
          {formatBillingMonth(month)}
          {' '}
          부과 상세
        </h2>
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
      </header>
      <BillingLoadState
        pending={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
      />
    </ClientModal>
  );

  return (
    <BillingDetail
      month={month}
      charges={list.data.charges}
      hasBuildings={list.data.hasBuildings}
      onClose={onClose}
    />
  );
}
