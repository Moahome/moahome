import { useState } from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import type {
  BillingSettings,
  BillingCharge
} from '@/entities/billing';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import {
  formatBillingMonth,
  getSortedBillingCharges,
  isBillingMonth,
  sumBillingItems
} from '../../../model/billing';
import { useBillingMonth } from '../../_hooks/useBillingData';
import { BillingLoadState } from '../billing-load-state/billingLoadState';
import { BillingDetail } from '../billing-detail/billingDetail';
import styles from './monthlyBilling.module.css';

/** 저장된 월별 청구와 예정액을 조회하고 검색·표시 개수·페이지를 세대 목록과 같은 방식으로 조합합니다. */
export function MonthlyBilling({ propertyId, settings, onOpenItems }: {
  propertyId: string; settings: BillingSettings; onOpenItems: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedMonth = params.get('month') ?? '';
  const month = isBillingMonth(requestedMonth) ? requestedMonth : settings.currentMonth;
  const list = useBillingMonth(propertyId, month);
  const [query, setQuery] = useState('');
  const [building, setBuilding] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState<{ month: string; charge: BillingCharge } | null>(null);
  const charges = getSortedBillingCharges(list.data?.charges ?? []);
  const hasBuildings = list.data?.hasBuildings ?? false;
  // 확정 내역의 동명도 선택할 수 있도록 해당 월의 실제 청구에서 필터 선택지를 구성합니다.
  const buildings = [...new Set(charges.map((charge) => charge.building).filter(Boolean))];
  const selectedBuilding = hasBuildings && buildings.includes(building) ? building : '';
  const hasFilters = Boolean(query.trim() || selectedBuilding);
  const filtered = charges.filter((charge) => (!selectedBuilding || charge.building === selectedBuilding)
    && `${charge.building} ${charge.room} ${charge.displayName ?? ''} ${charge.representativeName ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const total = charges.reduce((sum, charge) => sum + sumBillingItems(charge.items), BigInt(0));
  const upcoming = list.data?.status === 'SCHEDULED';
  const status = upcoming ? '부과 예정' : '확정';

  function changeMonth(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set('month', value);
    router.replace(`/manage/${propertyId}/billing/monthly?${next.toString()}`, {
      scroll: false
    });
    setPage(1);
    setBuilding('');
    setDetail(null);
  }
  /** 모바일은 직접 재진입 가능한 상세 주소로 이동하고 PC는 현재 목록 위에 상세 모달을 엽니다. */
  function openDetail(charge: BillingCharge) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/billing/monthly/${month}/${charge.unitId}`);
      return;
    }
    setDetail({
      month,
      charge
    });
  }

  return (
    <div
      className={styles.content}
    >
      <section
        className={styles.schedule}
        aria-label={'자동 부과 일정'}
      >
        <div
          className={styles['schedule-icon']}
        >
          <ServiceIcon
            name={'clock'}
            size={24}
          />
        </div>
        <div
          className={styles['schedule-copy']}
        >
          <h2>
            매월 1일, 자동으로 부과·확정합니다
          </h2>
          <p>
            한국시간 00시에 사용 중 세대에 부과하며, 공실은 제외합니다. 납부기한은 그달 말일입니다.
          </p>
        </div>
        <div
          className={styles['next-date']}
        >
          <span>
            다음 부과일
          </span>
          <strong>
            {settings.nextBillingDate.replaceAll('-', '.')}
          </strong>
        </div>
      </section>
      <div
        className={styles.toolbar}
      >
        <div>
          <h2>
            월별 부과 현황
          </h2>
          <p>
            조회할 월을 선택해 세대별 청구 내역을 확인하세요.
          </p>
        </div>
        <MonthPicker
          label={'조회 월'}
          value={month}
          onChange={changeMonth}
        />
      </div>
      {list.isPending || list.isError ? (
        <BillingLoadState
          pending={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          <div
            className={styles.summary}
          >
            <SummaryCard
              label={'부과 대상'}
              value={charges.length}
              unit={'세대'}
              tone={'primary'}
              icon={(
                <ServiceIcon
                  name={'users'}
                />
              )}
            />
            <SummaryCard
              label={'세대당 기본 금액'}
              value={formatInteger(list.data.baseAmount)}
              unit={'원'}
              icon={(
                <ServiceIcon
                  name={'coins'}
                />
              )}
            />
            <SummaryCard
              label={'확정 세대'}
              value={upcoming ? 0 : charges.length}
              unit={'세대'}
              tone={'success'}
              icon={(
                <ServiceIcon
                  name={'check'}
                />
              )}
            />
            <SummaryCard
              label={upcoming ? '청구 예정 합계' : '확정 청구 합계'}
              value={formatInteger(total)}
              unit={'원'}
              tone={'primary'}
              icon={(
                <ServiceIcon
                  name={'receipt'}
                />
              )}
            />
          </div>
          <ListCard>
            <div
              className={styles['card-header']}
            >
              <div>
                <h2>
                  {formatBillingMonth(month)}
                  {' '}
                  관리비
                </h2>
                <p>
                  전체 세대 ·
                  {charges.length}
                  세대
                </p>
              </div>
              {charges.length > 0 && (
                <span
                  className={styles.badge}
                  data-upcoming={upcoming}
                >
                  {status}
                </span>
              )}
            </div>
            <dl
              className={styles.dates}
            >
              <div>
                <dt>
                  부과일
                </dt>
                <dd>
                  {list.data.billingDate.replaceAll('-', '.')}
                </dd>
              </div>
              <div>
                <dt>
                  납부기한
                </dt>
                <dd>
                  {list.data.dueDate.replaceAll('-', '.')}
                </dd>
              </div>
            </dl>
            <div
              className={styles.filters}
              data-has-buildings={hasBuildings}
            >
              <Input
                aria-label={'관리비 세대 검색'}
                placeholder={hasBuildings ? '동·호수·세대 별칭·대표 주민 검색' : '호수·세대 별칭·대표 주민 검색'}
                value={query}
                leadingIcon={(
                  <ServiceIcon
                    name={'search'}
                  />
                )}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              />
              {hasBuildings && (
                <Dropdown
                  aria-label={'동 필터'}
                  clearable={false}
                  value={selectedBuilding || 'ALL'}
                  options={[{
                    value: 'ALL',
                    label: '전체 동'
                  }, ...buildings.map((name) => ({
                    value: name,
                    label: name
                  }))]}
                  onChange={(value) => { setBuilding(value === 'ALL' ? '' : value); setPage(1); }}
                />
              )}
              <Button
                variant={'outline'}
                disabled={!hasFilters}
                onClick={() => { setQuery(''); setBuilding(''); setPage(1); }}
                leadingIcon={(
                  <ServiceIcon
                    name={'reset'}
                  />
                )}
              >
                초기화
              </Button>
            </div>
            <ListToolbar
              total={filtered.length}
              unit={'세대'}
              sizeLabel={'관리비 표시 개수'}
              pageSize={pageSize}
              onSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
            <DataTable
              label={'세대별 관리비'}
              rows={visible}
              getRowKey={(charge) => charge.id}
              minWidth={600}
              onRowClick={openDetail}
              emptyState={(
                <>
                  <strong>
                    {hasFilters ? '검색 결과가 없어요.' : '선택한 월의 부과 내역이 없어요.'}
                  </strong>
                  <p>
                    {hasFilters ? '검색어나 동 필터를 변경해주세요.' : `첫 부과는 ${formatBillingMonth(settings.firstBillingMonth)}부터 시작합니다.`}
                  </p>
                </>
              )}
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
                  render: (charge) => (
                    <>
                      <button
                        type={'button'}
                        className={styles['detail-button']}
                        aria-label={`${charge.building} ${charge.room} 관리비 보기`.trim()}
                        onClick={() => openDetail(charge)}
                      >
                        {charge.room.endsWith('호') ? charge.room : `${charge.room}호`}
                      </button>
                      {charge.displayName && (
                        <span
                          className={styles.alias}
                        >
                          {charge.displayName}
                        </span>
                      )}
                    </>
                  )
                },
                {
                  key: 'representative',
                  header: '대표 주민',
                  render: (charge) => charge.representativeName ?? '—'
                },
                {
                  key: 'amount',
                  header: '청구 금액',
                  align: 'right',
                  render: (charge) => (
                    <strong
                      className={styles.amount}
                    >
                      {formatWon(sumBillingItems(charge.items))}
                    </strong>
                  )
                },
                {
                  key: 'status',
                  header: '상태',
                  render: () => (
                    <span
                      className={styles.badge}
                      data-upcoming={upcoming}
                    >
                      {status}
                    </span>
                  )
                }
              ]}
            />
            <Pagination
              label={'관리비 페이지'}
              unit={'세대'}
              total={filtered.length}
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
            <div
              className={styles.total}
            >
              <span>
                {upcoming ? '청구 예정 합계' : '확정 청구 합계'}
              </span>
              <strong>
                {formatWon(total)}
              </strong>
            </div>
          </ListCard>
          {detail?.month === month && (
            <BillingDetail
              propertyId={propertyId}
              canCancel={!upcoming && list.data.status === 'ISSUED' && month === settings.currentMonth}
              month={month}
              hasBuildings={hasBuildings}
              charges={[detail.charge]}
              upcoming={upcoming}
              onClose={() => setDetail(null)}
            />
          )}
        </>
      )}
      <section
        className={styles.notice}
      >
        <ServiceIcon
          name={'info'}
          size={20}
        />
        <div>
          <strong>
            기본 항목·금액 변경은 다음 달부터 적용돼요.
          </strong>
          <p>
            당월과 과거의 청구 금액은 바뀌지 않습니다.
          </p>
        </div>
        <Button
          variant={'text'}
          size={'sm'}
          onClick={onOpenItems}
        >
          관리비 설정
          <ServiceIcon
            name={'arrow'}
            size={16}
          />
        </Button>
      </section>
    </div>
  );
}
