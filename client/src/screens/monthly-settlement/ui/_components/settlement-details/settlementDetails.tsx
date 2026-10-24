import {
  useRef,
  useState,
  type KeyboardEvent
} from 'react';
import Link from 'next/link';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { filterMonthlyPreviewRows } from '@/widgets/payment-workspace';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  filterSettlementAccounts,
  filterSettlementBuildings,
  filterSettlementExternal,
  type getSettlementReport
} from '../../../model/monthlySettlement';
import styles from './settlementDetails.module.css';

const DETAIL_TABS = [
  {
    id: 'accounts',
    label: '통장별 잔액',
    icon: 'bank'
  },
  {
    id: 'buildings',
    label: '동별 자금',
    icon: 'building'
  },
  {
    id: 'collections',
    label: '수납과 미납',
    icon: 'receipt'
  },
  {
    id: 'external',
    label: '외부 부담금',
    icon: 'document'
  }
] as const;
const money = (value: string | bigint | null) => value === null ? '자료 확인 필요' : formatWon(value);

/** 한 번 조회한 정산 자료를 탭별로 탐색하며 검색·페이지 구분은 Excel의 전체 명세를 바꾸지 않습니다. */
export function SettlementDetails({ report, month, propertyId }: {
  report: ReturnType<typeof getSettlementReport>;
  month: string;
  propertyId: string;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get('tab');
  const tab = DETAIL_TABS.find((item) => item.id === requested)?.id ?? 'collections';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('전체');
  const [building, setBuilding] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountStatus, setAccountStatus] = useState('전체');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [buildingStatus, setBuildingStatus] = useState('전체');
  const [externalQuery, setExternalQuery] = useState('');
  const [externalStatus, setExternalStatus] = useState('전체');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const collections = filterMonthlyPreviewRows(report.collections, {
    query,
    status,
    building
  });
  const buildingOptions = [...new Set(report.collections.map((row) => row.buildingName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', {
    numeric: true
  }));
  const accounts = filterSettlementAccounts(report.accounts, accountQuery, accountStatus);
  const buildings = filterSettlementBuildings(report.buildings, buildingQuery, buildingStatus);
  const external = filterSettlementExternal(report.external, externalQuery, externalStatus);
  const totals = {
    accounts: accounts.length,
    buildings: buildings.length,
    collections: collections.length,
    external: external.length
  };
  const total = totals[tab];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const href = (path: string) => `/manage/${propertyId}/${path}?month=${month}`;
  const pageRows = <Row,>(rows: Row[]) => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** 탭 선택을 URL에 남겨 새로고침과 직접 진입에서도 같은 상세를 보여줍니다. */
  function changeTab(value: typeof DETAIL_TABS[number]['id']) {
    const params = new URLSearchParams(search.toString());
    params.set('month', month);
    params.set('tab', value);
    setPage(1);
    router.replace(`/manage/${propertyId}/closing/monthly?${params}`, {
      scroll: false
    });
  }

  /** 방향키와 Home·End로 선택·포커스를 함께 옮기고 Tab 키는 선택 탭만 거칩니다. */
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % DETAIL_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + DETAIL_TABS.length - 1) % DETAIL_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = DETAIL_TABS.length - 1;
    else return;
    event.preventDefault();
    refs.current[next]?.focus();
    changeTab(DETAIL_TABS[next].id);
  }

  const pageSizeControl = (
    <Dropdown
      aria-label={'정산 상세 표시 개수'}
      value={String(pageSize)}
      options={[10, 20, 50].map((size) => ({
        value: String(size),
        label: `${size}개씩 보기`
      }))}
      onChange={(value) => { setPageSize(Number(value)); setPage(1); }}
    />
  );

  return (
    <div
      className={styles.details}
    >
      <div
        className={styles.tabs}
        role={'tablist'}
        aria-label={'월별 정산 상세'}
      >
        {DETAIL_TABS.map((item, index) => (
          <Button
            key={item.id}
            ref={(element) => { refs.current[index] = element; }}
            variant={'ghost'}
            role={'tab'}
            id={`settlement-tab-${item.id}`}
            aria-controls={`settlement-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => changeTab(item.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
            leadingIcon={(
              <ServiceIcon
                name={item.icon}
              />
            )}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <section
        className={styles.panel}
        id={'settlement-panel-accounts'}
        role={'tabpanel'}
        aria-labelledby={'settlement-tab-accounts'}
        hidden={tab !== 'accounts'}
        tabIndex={0}
      >
        <div
          className={styles.heading}
        >
          <h2
            id={'settlement-accounts'}
          >
            통장별 잔액
          </h2>
          <Link
            href={href('banking/balances')}
          >
            잔액 확인
          </Link>
        </div>
        <p>
          같은 시점의 잔액만 차액을 표시합니다. 차액이 없어도 대사 확정을 뜻하지 않습니다.
        </p>
        <div
          className={styles.filters}
          data-simple={'true'}
        >
          <Input
            aria-label={'통장 잔액 검색'}
            placeholder={'통장명, 은행명으로 검색'}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
            value={accountQuery}
            onChange={(event) => { setAccountQuery(event.target.value); setPage(1); }}
          />
          <Dropdown
            aria-label={'잔액 비교 상태'}
            value={accountStatus}
            options={['전체', '차액 없음', '차액 있음', '비교 자료 필요'].map((value) => ({
              value,
              label: value === '전체' ? '전체 상태' : value
            }))}
            onChange={(value) => { setAccountStatus(value); setPage(1); }}
          />
          {pageSizeControl}
          <Button
            variant={'outline'}
            className={styles['reset-button']}
            leadingIcon={(
              <ServiceIcon
                name={'reset'}
              />
            )}
            onClick={() => { setAccountQuery(''); setAccountStatus('전체'); setPage(1); }}
          >
            초기화
          </Button>
        </div>
        <DataTable
          label={'통장별 잔액'}
          rows={pageRows(accounts)}
          getRowKey={(row) => row.id}
          emptyState={report.accounts.length ? '조회 조건에 맞는 내역이 없습니다.' : '조회할 통장 잔액 자료가 없습니다.'}
          minWidth={1050}
          columns={[
            {
              key: 'name',
              header: '통장',
              render: (row) => row.label
            },
            {
              key: 'confirmed',
              header: '은행 확인 잔액',
              render: (row) => money(row.confirmed),
              align: 'right'
            },
            {
              key: 'asof',
              header: '확인시점 / 출처',
              render: (row) => `${row.asOf ?? '—'} · ${row.source}`
            },
            {
              key: 'calculated',
              header: '월말 계산 잔액',
              render: (row) => money(row.calculated),
              align: 'right'
            },
            {
              key: 'difference',
              header: '같은 시점 차액',
              render: (row) => row.difference === null ? '비교 불가' : money(row.difference),
              align: 'right'
            },
            {
              key: 'comparison',
              header: '비교 상태',
              render: (row) => row.comparison
            }
          ]}
        />
      </section>
      <section
        className={styles.panel}
        id={'settlement-panel-buildings'}
        role={'tabpanel'}
        aria-labelledby={'settlement-tab-buildings'}
        hidden={tab !== 'buildings'}
        tabIndex={0}
      >
        <div
          className={styles.heading}
        >
          <h2
            id={'settlement-buildings'}
          >
            동별 자금
          </h2>
          <Link
            href={href('banking/balances')}
          >
            동별 잔고·정산
          </Link>
        </div>
        <div
          className={styles.filters}
          data-simple={'true'}
        >
          <Input
            aria-label={'동별 자금 검색'}
            placeholder={'동 이름으로 검색'}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
            value={buildingQuery}
            onChange={(event) => { setBuildingQuery(event.target.value); setPage(1); }}
          />
          <Dropdown
            aria-label={'보유금 설정 상태'}
            value={buildingStatus}
            options={['전체', '설정됨', '설정 필요'].map((value) => ({
              value,
              label: value === '전체' ? '전체 상태' : value
            }))}
            onChange={(value) => { setBuildingStatus(value); setPage(1); }}
          />
          {pageSizeControl}
          <Button
            variant={'outline'}
            className={styles['reset-button']}
            leadingIcon={(
              <ServiceIcon
                name={'reset'}
              />
            )}
            onClick={() => { setBuildingQuery(''); setBuildingStatus('전체'); setPage(1); }}
          >
            초기화
          </Button>
        </div>
        <DataTable
          label={'동별 자금'}
          rows={pageRows(buildings)}
          getRowKey={(row) => row.id}
          emptyState={report.buildings.length ? '조회 조건에 맞는 내역이 없습니다.' : '조회할 동별 자금 자료가 없습니다.'}
          columns={[
            {
              key: 'name',
              header: '동',
              render: (row) => row.label
            },
            {
              key: 'opening',
              header: '기초 보유금',
              render: (row) => money(row.startBalance),
              align: 'right'
            },
            {
              key: 'income',
              header: '월 입금',
              render: (row) => money(row.income),
              align: 'right'
            },
            {
              key: 'expense',
              header: '부담 지출',
              render: (row) => money(row.expense),
              align: 'right'
            },
            {
              key: 'balance',
              header: '기말 보유금',
              render: (row) => money(row.balance),
              align: 'right'
            }
          ]}
        />
      </section>
      <section
        className={styles.panel}
        id={'settlement-panel-collections'}
        role={'tabpanel'}
        aria-labelledby={'settlement-tab-collections'}
        hidden={tab !== 'collections'}
        tabIndex={0}
      >
        <div
          className={styles.heading}
        >
          <h2
            id={'settlement-collections'}
          >
            수납과 미납
          </h2>
          <Link
            href={href('banking/monthly')}
          >
            월별 수납 현황
          </Link>
        </div>
        <p>
          기존 월별 수납 현황과 같은 대상·월말 누적 기준입니다. 이전 월 미납과 선입금 충당을 포함합니다.
        </p>
        <div
          className={styles.filters}
        >
          <Input
            aria-label={'수납·미납 검색'}
            placeholder={'세대명, 대표 이름, 입금자로 검색'}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          />
          <Dropdown
            aria-label={'납부 상태'}
            value={status}
            options={['전체', '납부완료', '일부납부', '미납', '정산 확인 필요'].map((value) => ({
              value,
              label: value === '전체' ? '전체 상태' : value
            }))}
            onChange={(value) => { setStatus(value); setPage(1); }}
          />
          <Dropdown
            aria-label={'조회 동'}
            value={building}
            options={[{
              value: '',
              label: '전체 동'
            }, ...buildingOptions.map((value) => ({
              value,
              label: value
            }))]}
            onChange={(value) => { setBuilding(value); setPage(1); }}
          />
          {pageSizeControl}
          <Button
            variant={'outline'}
            className={styles['reset-button']}
            leadingIcon={(
              <ServiceIcon
                name={'reset'}
              />
            )}
            onClick={() => { setQuery(''); setStatus('전체'); setBuilding(''); setPage(1); }}
          >
            초기화
          </Button>
        </div>
        <DataTable
          label={'수납과 미납'}
          rows={pageRows(collections)}
          getRowKey={(row) => row.unitId}
          emptyState={report.collections.length ? '조회 조건에 맞는 세대가 없습니다.' : '조회 월의 수납 대상 세대가 없습니다.'}
          minWidth={1000}
          columns={[
            {
              key: 'unit',
              header: '세대',
              render: (row) => row.unitLabel
            },
            {
              key: 'carry',
              header: '전월 이월액',
              render: (row) => money(row.carry),
              align: 'right'
            },
            {
              key: 'billed',
              header: '당월 발생액',
              render: (row) => money(row.billed + (row.settlementAmount ?? BigInt(0))),
              align: 'right'
            },
            {
              key: 'applied',
              header: '수납 반영액',
              render: (row) => money(row.applied),
              align: 'right'
            },
            {
              key: 'balance',
              header: '미수금',
              render: (row) => row.settlementPending ? '정산 확인 필요' : money(row.balance),
              align: 'right'
            },
            {
              key: 'prepaid',
              header: '선입금',
              render: (row) => money(row.prepaid),
              align: 'right'
            },
            {
              key: 'status',
              header: '상태',
              render: (row) => (
                <span
                  className={styles.badge}
                  data-status={row.status}
                >
                  {row.status}
                </span>
              )
            }
          ]}
        />
      </section>
      <section
        className={styles.panel}
        id={'settlement-panel-external'}
        role={'tabpanel'}
        aria-labelledby={'settlement-tab-external'}
        hidden={tab !== 'external'}
        tabIndex={0}
      >
        <div
          className={styles.heading}
        >
          <h2
            id={'settlement-external'}
          >
            외부 부담금
          </h2>
          <Link
            href={href('banking/balances')}
          >
            외부 부담금 정산
          </Link>
        </div>
        <p>
          선택한 월에 지출한 외부 부담금입니다. 정산 제외분은 합계에서 빼고 내역은 보존합니다.
        </p>
        <div
          className={styles.filters}
          data-simple={'true'}
        >
          <Input
            aria-label={'외부 부담금 검색'}
            placeholder={'부담처, 지출명으로 검색'}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
            value={externalQuery}
            onChange={(event) => { setExternalQuery(event.target.value); setPage(1); }}
          />
          <Dropdown
            aria-label={'회수 상태'}
            value={externalStatus}
            options={['전체', '미회수 전체', '회수 필요', '일부 회수', '회수 완료', '정산 제외'].map((value) => ({
              value,
              label: value === '전체' ? '전체 상태' : value
            }))}
            onChange={(value) => { setExternalStatus(value); setPage(1); }}
          />
          {pageSizeControl}
          <Button
            variant={'outline'}
            className={styles['reset-button']}
            leadingIcon={(
              <ServiceIcon
                name={'reset'}
              />
            )}
            onClick={() => { setExternalQuery(''); setExternalStatus('전체'); setPage(1); }}
          >
            초기화
          </Button>
        </div>
        <DataTable
          label={'외부 부담금'}
          rows={pageRows(external)}
          getRowKey={(row) => row.id}
          emptyState={report.external.length ? '조회 조건에 맞는 내역이 없습니다.' : '조회할 외부 부담금이 없습니다.'}
          columns={[
            {
              key: 'date',
              header: '지출일',
              render: (row) => row.date
            },
            {
              key: 'target',
              header: '부담처 / 지출명',
              render: (row) => `${row.label} · ${row.expenseName}`
            },
            {
              key: 'amount',
              header: '부담액',
              render: (row) => money(row.amount),
              align: 'right'
            },
            {
              key: 'received',
              header: '회수액',
              render: (row) => money(row.received),
              align: 'right'
            },
            {
              key: 'remaining',
              header: '미회수액',
              render: (row) => money(row.remaining),
              align: 'right'
            },
            {
              key: 'status',
              header: '회수 상태',
              render: (row) => (
                <span
                  className={styles.badge}
                  data-status={row.recoveryStatus}
                >
                  {row.recoveryStatus}
                </span>
              )
            }
          ]}
        />
      </section>
      <div
        className={styles.footer}
      >
        <Pagination
          label={'정산 상세 페이지'}
          unit={'건'}
          total={total}
          page={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
