'use client';
import {
  type CSSProperties,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode
} from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useQuery,
  useQueryClient,
  type QueryFilters
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { isServerConnectionError } from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import {
  AmountInput,
  Dropdown,
  Input,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { Toast } from '@/shared/ui/toast';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import {
  getBankingBalances,
  saveCashOpenings,
  correctCashOpenings,
  assignCashIncome,
  settleExternalExpense,
  decideExternalSettlement,
  balanceError,
  type BalanceBuilding,
  type BalanceEntry,
  type BalanceWorkspace
} from '../../api/bankingBalanceApi';
import {
  createBalanceWorkbook,
  getBalanceSummary,
  getBuildingLedger
} from '../../model/balanceLedger';
import {
  bankingError,
  deleteBankingTransactions
} from '../../api/bankingApi';
import { sortExpenseLabels } from '../../model/expenseAllocation';
import { BankingExpensePage } from '../banking-expense-page/bankingExpensePage';
import { AccountBalances } from '../_components/account-balances/accountBalances';
import {
  getAccountBalanceDisplay,
  getAccountBalanceTotal
} from '../../model/accountBalance';
import styles from './bankingBalances.module.css';
type Action = {
    kind: 'opening' | 'settlement' | 'assignment' | 'difference';
    id?: string;
};
export type BalancePanel = Action['kind'] | 'chart';
const PANEL_TITLES: Record<BalancePanel, string> = {
  opening: '기준 잔고 확인',
  chart: '동별 입금·지출 비교',
  difference: '잔고 차이 내역',
  settlement: '외부 부담금 정산',
  assignment: '입금 귀속 동 확인'
};
const money = (value: string | bigint | null) => value === null ? '설정 필요' : formatWon(value);
/** 조회 동작과 도움말 터치를 분리하고 마우스·키보드·터치에서 같은 설명을 제공합니다. */
function OpeningBalanceAction({ missing, onOpen }: { missing: boolean; onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = missing ? '시작 잔고 설정' : '기준 잔고 확인';
  const [tooltipWidth, setTooltipWidth] = useState(400);

  // 버튼 왼쪽 정렬을 유지하고 화면 오른쪽에 남은 공간 안에서 설명 너비를 제한합니다.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      setTooltipWidth(Math.min(400, window.innerWidth - 40, window.innerWidth - 21 - bounds.left));
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={styles['opening-action']}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Button
        className={styles['opening-info']}
        variant={'ghost'}
        iconOnly
        aria-label={'기준 잔고 도움말'}
        aria-expanded={open}
        aria-controls={'opening-balance-description'}
        aria-describedby={open ? 'opening-balance-description' : undefined}
        onClick={() => setOpen(true)}
        leadingIcon={(
          <ServiceIcon
            name={'info'}
          />
        )}
      />
      <Button
        className={styles['opening-button']}
        aria-describedby={open ? 'opening-balance-description' : undefined}
        onClick={() => { setOpen(false); onOpen(); }}
      >
        {label}
      </Button>
      {open && (
        <div
          id={'opening-balance-description'}
          role={'tooltip'}
          className={styles['opening-tooltip']}
          style={{
            '--opening-tooltip-width': `${tooltipWidth}px`
          } as CSSProperties}
        >
          <span
            className={styles['opening-tooltip-icon']}
            aria-hidden={'true'}
          >
            <ServiceIcon
              name={'info'}
            />
          </span>
          <div
            className={styles['opening-tooltip-content']}
          >
            <strong>
              {label}
            </strong>
            <p>
              {missing ? '기준일의 동별 보유금을 등록합니다.' : '등록한 동별 기준 잔고를 확인·수정합니다.'}
            </p>
            <small>
              은행 실시간 잔액 조회는 아닙니다.
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
/** 조회 조건·선택 동을 유지하며 실제 서버 잔고와 외부 입금 연결을 표시합니다. */
export function BankingBalances({ propertyId, buildingId, panel, renderReceiptDetail }: {
    propertyId: string;
    buildingId?: string;
    panel?: BalancePanel;
    renderReceiptDetail?: (paymentId: string, onClose: () => void) => ReactNode;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('month');
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul'
  }).format(new Date()).slice(0, 7);
  const accountId = params.get('account') ?? 'ALL';
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [sort, setSort] = useState('name');
  const [filter, setFilter] = useState(params.get('filter') ?? 'ALL');
  const [incomeBuilding, setIncomeBuilding] = useState('ALL');
  const [incomeSearch, setIncomeSearch] = useState('');
  const [externalFilter, setExternalFilter] = useState('ACTIVE');
  const [externalSearch, setExternalSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportBusy = useRef(false);
  const query = useQuery({
    queryKey: ['banking-balances', session.data?.id, propertyId, month, accountId],
    queryFn: () => getBankingBalances(propertyId, month, accountId === 'ALL' ? undefined : accountId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const data = query.data;
  // 사용 전 월의 오래된 선택 URL도 서버가 확정한 전체 범위로 맞춰 새로고침·상세 이동에서 되살아나지 않게 합니다.
  useEffect(() => {
    if (!data?.accounts || data.accountId !== null || accountId === 'ALL' || data.accounts.some((account) => account.id === accountId)) return;
    const next = new URLSearchParams(params.toString());
    next.set('account', 'ALL');
    router.replace(`?${next}`, {
      scroll: false
    });
  }, [data, accountId, params, router]);
  const title = panel ? PANEL_TITLES[panel] : buildingId ? '동별 상세 원장' : '동별 잔고·정산';
  if (!data && isServerConnectionError(query.error)) return (
    <ServerConnectionError
      onRetry={() => { void query.refetch({
        cancelRefetch: false
      }); }}
    />
  );
  if (!data)
    return (
      <section
        className={styles.page}
      >
        <ListHeader
          className={styles.header}
          titleId={'balance-title'}
          menu={'통장 관리'}
          title={title}
          description={'은행 거래를 기준으로 동별 보유금과 외부 부담금을 확인합니다.'}
        />
        <p
          role={query.isPending ? 'status' : 'alert'}
        >
          {query.isPending ? '잔고를 불러오고 있어요.' : balanceError(query.error)}
        </p>
        {!query.isPending && (
          <Button
            variant={'outline'}
            onClick={() => { void query.refetch(); }}
          >
            다시 시도
          </Button>
        )}
      </section>
    );
  const summary = getBalanceSummary(data);
  const selectedAccount = data.accounts?.find((account) => account.id === accountId);
  const visibleAccounts = selectedAccount ? [selectedAccount] : data.accounts ?? [];
  const accountDisplays = visibleAccounts.map(getAccountBalanceDisplay);
  const { amount: bankBalance, calculated } = getAccountBalanceTotal(data);
  let bankAsOf = data.bankAsOf;
  let bankLabel = selectedAccount ? '선택 통장 확인 잔액' : '은행 확인 잔고';
  if (calculated) {
    bankLabel = selectedAccount ? '선택 통장 계산 잔액' : '통장 잔액 합계';
    bankAsOf = '계산 잔액을 포함한 통장별 잔액 합계';
  }
  if (accountDisplays.length === 1) bankAsOf = accountDisplays[0].description;
  let bankHelp = '은행 거래 파일 또는 잔액 인계에 기록된 마지막 잔액입니다.';
  if (calculated) bankHelp = accountDisplays.length > 1
    ? '통장별 은행 확인값 또는 계산 잔액을 합한 금액입니다.'
    : '시작 잔고에 등록된 통장 입출금을 반영한 금액입니다.';
  const differenceDescription = calculated ? '통장 잔액 − 동별 잔고 합계 · 계산 잔액 포함' : '통장 잔액 − 동별 잔고 합계';
  const missing = data.buildings.filter((b) => b.active && b.status === 'OPENING_REQUIRED');
  const filtered = sortExpenseLabels(data.buildings).filter((b) => b.label.includes(search.trim()) && (filter === 'ALL' || (filter === 'NEEDS_OPENING' && b.status === 'OPENING_REQUIRED') || (filter === 'NEGATIVE' && b.balance !== null && BigInt(b.balance) < BigInt(0))));
  if (sort !== 'name')
    filtered.sort((a, b) => {
      if (a.balance === null || b.balance === null)
        return a.balance === b.balance ? 0 : a.balance === null ? 1 : -1;
      const left = BigInt(a.balance), right = BigInt(b.balance);
      return left === right ? 0 : (left > right ? 1 : -1) * (sort === 'high' ? -1 : 1);
    });
  const exportRows = selected.length ? filtered.filter((b) => selected.includes(b.id)) : filtered;
  const detailBuilding = data.buildings.find((b) => b.id === (buildingId ?? detail));
  const balanceQuery = new URLSearchParams({
    month
  });
  if (selectedAccount) balanceQuery.set('account', selectedAccount.id);
  const balanceListHref = `/manage/${propertyId}/banking/balances?${balanceQuery}`;
  /** 변경 성공 후 서버 조회를 갱신하고 실패한 폼은 닫지 않습니다. */
  async function saved(message: string, keepOpen = false) {
    await cache.invalidateQueries({
      queryKey: ['banking-balances', session.data?.id, propertyId]
    });
    if (!keepOpen) setAction(null);
    if (panel && !keepOpen) {
      router.replace(balanceListHref);
      return;
    }
    setNotice({
      message,
      tone: 'success'
    });
  }
  /** PC 목록은 보존하고 모바일 직접 접근·새로고침이 가능한 상세 경로로 연결합니다. */
  function openDetail(b: BalanceBuilding) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/banking/balances/${b.id}?${balanceQuery}`);
      return;
    }
    setDetail(b.id);
  }
  /** 모바일은 월·대상 ID를 가진 독립 페이지, PC는 현재 목록 위의 공통 모달을 사용합니다. */
  function openPanel(kind: BalancePanel, id?: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const queryParams = new URLSearchParams({
        month
      });
      if (selectedAccount) queryParams.set('account', selectedAccount.id);
      if (id) queryParams.set('target', id);
      if (kind === 'chart') {
        queryParams.set('search', search);
        queryParams.set('filter', filter);
      }
      router.push(`/manage/${propertyId}/banking/balances/details/${kind}?${queryParams}`);
      return;
    }
    if (kind === 'chart') {
      setChartOpen(true);
      return;
    }
    setAction({
      kind,
      id
    });
  }
  async function download() {
    if (exportBusy.current || !exportRows.length)
      return;
    exportBusy.current = true;
    setExporting(true);
    try {
      const blob = await createBalanceWorkbook(data!, exportRows);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `모아홈_동별잔고_${month}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch {
      setNotice({
        message: '엑셀 파일을 만들지 못했어요. 다시 시도해주세요.',
        tone: 'error'
      });
    }
    finally {
      exportBusy.current = false;
      setExporting(false);
    }
  }
  if (panel) {
    const closePage = () => router.replace(balanceListHref);
    if (panel === 'chart') return (
      <ChartDialog
        buildings={filtered}
        presentation={'page'}
        onClose={closePage}
      />
    );
    return (
      <BalanceActionDialog
        key={`${panel}-${params.get('target') ?? ''}`}
        action={{
          kind: panel,
          id: params.get('target') ?? undefined
        }}
        data={data}
        propertyId={propertyId}
        presentation={'page'}
        onClose={closePage}
        onSaved={saved}
      />
    );
  }
  if (buildingId)
    return (
      <section
        className={styles.page}
      >
        <ListHeader
          className={styles.header}
          titleId={'balance-title'}
          menu={'통장 관리'}
          title={detailBuilding ? `${detailBuilding.label} 상세 원장` : '동별 상세 원장'}
          description={`${month} 기준 실제 입금과 부담 지출입니다.`}
        />
        {detailBuilding ? (
          <BuildingLedger
            building={detailBuilding}
            data={data}
            propertyId={propertyId}
            renderReceiptDetail={renderReceiptDetail}
          />
        ) : (
          <p>
            해당 동의 원장을 찾을 수 없습니다.
          </p>
        )}
      </section>
    );
  const buildingColumns: DataTableColumn<BalanceBuilding>[] = [
    {
      key: 'select',
      header: '선택',
      width: 60,
      render: (b) => (
        <input
          type={'checkbox'}
          aria-label={`${b.label} 선택`}
          checked={selected.includes(b.id)}
          onChange={(e) => setSelected((current) => e.target.checked ? [...current, b.id] : current.filter((id) => id !== b.id))}
        />
      )
    },
    {
      key: 'building',
      header: '동',
      render: (b) => (
        <strong>
          {b.label}
          {!b.active && (
            <small
              className={styles.muted}
            >
              보관된 동
            </small>
          )}
        </strong>
      )
    },
    {
      key: 'start',
      header: '기초 잔고',
      render: (b) => money(b.startBalance)
    },
    {
      key: 'income',
      header: '월 입금',
      render: (b) => b.status === 'READY' ? money(b.income) : '—'
    },
    {
      key: 'expense',
      header: '월 지출',
      render: (b) => b.status === 'READY' ? money(b.expense) : '—'
    },
    {
      key: 'balance',
      header: '월말 잔고',
      render: (b) => (
        <strong
          data-negative={b.balance !== null && BigInt(b.balance) < BigInt(0)}
        >
          {money(b.balance)}
        </strong>
      )
    }
  ];

  return (
    <section
      className={styles.page}
    >
      <ListHeader
        className={styles.header}
        actionsClassName={styles['header-actions']}
        titleId={'balance-title'}
        menu={'통장 관리'}
        title={'동별 잔고·정산'}
        description={'은행 거래를 기준으로 각 동의 보유금과 외부 부담금을 확인합니다.'}
        actions={(
          <>
            <div
              className={styles['action-buttons']}
            >
              <OpeningBalanceAction
                missing={missing.length > 0}
                onOpen={() => openPanel('opening', selectedAccount?.id)}
              />
              <Button
                variant={'outline'}
                tone={'excel'}
                loading={exporting}
                disabled={!exportRows.length}
                onClick={() => { void download(); }}
                leadingIcon={(
                  <ServiceIcon
                    name={'excel'}
                  />
                )}
              >
                엑셀 다운로드
              </Button>
            </div>
          </>
        )}
      />
      <section
        className={styles['query-card']}
        aria-label={'조회 조건'}
      >
        <h2>
          조회 조건
        </h2>
        <div
          className={styles['query-controls']}
        >
          <div
            className={styles['month-control']}
          >
            <MonthPicker
              label={'조회 월'}
              labelHidden
              value={month}
              onChange={(value) => {
                setSelected([]); setDetail(null);
                const next = new URLSearchParams(params.toString()); next.set('month', value);
                router.replace(`?${next}`, {
                  scroll: false
                });
              }}
            />
          </div>
          {!!data.accounts?.length && (
            <Dropdown
              aria-label={'조회 통장'}
              className={styles['account-control']}
              value={selectedAccount?.id ?? 'ALL'}
              onChange={(value) => {
                const next = new URLSearchParams(params.toString()); next.set('account', value); next.set('month', month);
                router.replace(`?${next}`, {
                  scroll: false
                });
              }}
              options={[{
                value: 'ALL',
                label: '전체 통장'
              }, ...data.accounts.map((account) => ({
                value: account.id,
                label: account.label
              }))]}
            />
          )}
        </div>
      </section>
      {data.cutoffDate && (
        <p
          className={styles['calculation-note']}
        >
          잔고 기준일
          {' '}
          {data.cutoffDate}
          {' '}
          ·
          {' '}
          {month <= data.cutoffDate.slice(0, 7) ? '기준 잔고에서 확인된 입출금을 역산합니다.' : '기준 잔고 이후 확인된 입출금을 누적합니다.'}
          {' '}
          미처리 거래와 귀속 미확인 입금은 동별 잔고에 반영되지 않습니다.
        </p>
      )}
      <div
        className={styles.summary}
      >
        <SummaryCard
          density={'compact'}
          label={bankLabel}
          value={bankBalance === null ? '은행 확인 자료 없음' : formatInteger(bankBalance)}
          unit={bankBalance === null ? '' : '원'}
          description={bankAsOf ?? '잔액이 0원이라는 뜻은 아닙니다.'}
          help={(
            <InfoTooltip
              size={'sm'}
              label={`${bankLabel} 도움말`}
              title={bankLabel}
              note={'표시된 시점 기준이며 실시간 잔액이 아닙니다.'}
            >
              {bankHelp}
            </InfoTooltip>
          )}
          tone={'primary'}
          icon={(
            <ServiceIcon
              name={'bank'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'동별 잔고 합계'}
          help={(
            <InfoTooltip
              size={'sm'}
              label={'동별 잔고 합계 도움말'}
              title={'동별 잔고 합계'}
              note={'동에 배분하지 않은 입금은 포함하지 않습니다.'}
            >
              {selectedAccount ? '선택한 통장 안에서 각 동에 귀속된 잔고를 합한 금액입니다.' : '조회 중인 모든 통장의 동별 잔고를 합한 금액입니다.'}
            </InfoTooltip>
          )}
          tone={'warning'}
          value={summary.total === null ? '설정 필요' : formatInteger(summary.total)}
          unit={summary.total === null ? '' : '원'}
          description={data.cutoffDate ? `${data.cutoffDate} 기준 잔고로 계산` : summary.total !== null ? '통장마다 등록한 기준일로 계산' : '통장을 선택해 동별 시작 잔고를 등록해주세요.'}
          icon={(
            <ServiceIcon
              name={'coins'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'잔고 비교 차이'}
          help={(
            <InfoTooltip
              size={'sm'}
              label={'잔고 비교 차이 도움말'}
              title={'잔고 비교 차이'}
              note={'확인 시점과 미배분 거래에 따라 차이가 날 수 있습니다.'}
            >
              화면의 통장 잔액에서 동별 잔고 합계를 뺀 금액입니다.
            </InfoTooltip>
          )}
          value={summary.difference === null ? '계산 자료 없음' : formatInteger(summary.difference)}
          unit={summary.difference === null ? '' : '원'}
          description={summary.difference === null ? '통장 잔액과 동별 기준 잔고가 있어야 계산할 수 있어요.' : differenceDescription}
          tone={'success'}
          valueTone={summary.difference !== null && summary.difference < BigInt(0) ? 'danger' : 'neutral'}
          icon={(
            <ServiceIcon
              name={'info'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'관리 동 수'}
          value={data.buildings.filter((b) => b.active).length}
          unit={'개 동'}
          description={'등록된 관리 동 기준'}
          icon={(
            <ServiceIcon
              name={'building'}
            />
          )}
        />
      </div>
      {!!data.accounts?.length && (
        <AccountBalances
          accounts={visibleAccounts}
        />
      )}
      <section
        className={styles.card}
      >
        <h2>
          동별 잔고 목록
        </h2>
        <p
          className={styles.muted}
        >
          행을 누르면 상세 원장을 확인합니다. 기초 잔고는 조회 월의 전월 말 잔고입니다.
        </p>
        <PagedTable
          label={'동별 잔고'}
          rows={filtered}
          columns={buildingColumns}
          onRowClick={openDetail}
          toolbar={(
            <>
              <Input
                label={'동 검색'}
                value={search}
                onChange={(e) => { setSearch(e.target.value);setSelected([]); }}
                placeholder={'예: 102동'}
              />
              <Dropdown
                label={'잔고 정렬'}
                value={sort}
                onChange={setSort}
                options={[{
                  value: 'name',
                  label: '동 이름순'
                }, {
                  value: 'high',
                  label: '잔고 높은 순'
                }, {
                  value: 'low',
                  label: '잔고 낮은 순'
                }]}
              />
              <Dropdown
                label={'잔고 상태'}
                value={filter}
                onChange={(value) => { setFilter(value);setSelected([]); }}
                options={[{
                  value: 'ALL',
                  label: '전체'
                }, {
                  value: 'NEEDS_OPENING',
                  label: '시작 잔고 필요'
                }, {
                  value: 'NEGATIVE',
                  label: '잔고 부족'
                }]}
              />
            </>
          )}
        />
        {selected.length > 0 && (
          <div
            className={styles['selection-summary']}
          >
            <span>
              선택
              {exportRows.length}
              개 동 · 합계
              {exportRows.every((b) => b.balance !== null) ? money(exportRows.reduce((sum, b) => sum + BigInt(b.balance!), BigInt(0))) : '설정 필요'}
            </span>
            <Button
              variant={'outline'}
              size={'sm'}
              onClick={() => setSelected([])}
            >
              선택 해제
            </Button>
          </div>
        )}
      </section>
      <div
        className={styles['lower-grid']}
      >
        <section
          className={styles.card}
        >
          <h2>
            월 입금·출금 비중
          </h2>
          <p
            className={styles.muted}
          >
            현재 조회 동
            {' '}
            {filtered.length}
            개 · 월 입금 / 출금
          </p>
          <button
            className={styles['chart-trigger']}
            aria-label={'동별 입금 출금 그래프'}
            onClick={() => openPanel('chart')}
          >
            <BalanceChart
              rows={filtered}
            />
          </button>
        </section>
        <section
          className={[styles.card, styles['difference-card']].join(' ')}
        >
          <h2>
            잔고 차이 확인
          </h2>
          <dl
            className={styles.overview}
          >
            <div>
              <dt>
                통장 잔액 − 동별 합계
              </dt>
              <dd
                data-negative={summary.difference !== null && summary.difference < BigInt(0)}
              >
                {money(summary.difference)}
              </dd>
            </div>
            <div>
              <dt>
                외부 대납 미회수액
              </dt>
              <dd>
                {money(summary.external)}
              </dd>
            </div>
            <div>
              <dt>
                처리 전 은행 거래
              </dt>
              <dd>
                {data.pending.length}
                건
              </dd>
            </div>
            <div>
              <dt>
                귀속 확인할 입금
              </dt>
              <dd>
                {data.incomes.filter((i) => BigInt(i.available) > BigInt(0)).length}
                건
              </dd>
            </div>
          </dl>
          <p
            className={styles.muted}
          >
            외부 대납금·기타 입금·미분류 거래·시작 잔고 차이를 확인해야 합니다. 차이를 특정 동에 자동 반영하지 않습니다.
          </p>
          <button
            type={'button'}
            className={styles['difference-trigger']}
            aria-label={'잔고 차이 내역 확인'}
            onClick={() => openPanel('difference')}
          />
        </section>
      </div>
      <section
        className={styles.card}
      >
        <h2>
          외부 부담금 정산
        </h2>
        <p
          className={styles.muted}
        >
          기준일 이후 조회 월 말까지의 부담금입니다. 실제 기타 입금을 연결한 금액만 회수액에 반영합니다.
        </p>
        <PagedTable
          label={'외부 부담금'}
          rows={data.externals.filter((row) => (externalFilter === 'ALL' || Boolean(row.excluded) === (externalFilter === 'EXCLUDED')) && `${row.label} ${row.expenseName}`.includes(externalSearch.trim())).sort((a, b) => b.date.localeCompare(a.date))}
          toolbar={(
            <>
              <Input
                label={'외부 부담금 검색'}
                placeholder={'부담처·지출명 검색'}
                value={externalSearch}
                onChange={(event) => setExternalSearch(event.target.value)}
              />
              <Dropdown
                label={'정산 대상'}
                value={externalFilter}
                onChange={setExternalFilter}
                options={[{
                  value: 'ACTIVE',
                  label: '정산 대상'
                }, {
                  value: 'EXCLUDED',
                  label: '정산에서 제외'
                }, {
                  value: 'ALL',
                  label: '전체 내역'
                }]}
              />
            </>
          )}
          onRowClick={(row) => openPanel('settlement', row.id)}
          columns={[
            {
              key: 'date',
              header: '거래일',
              render: (e) => e.date
            }, {
              key: 'name',
              header: '지출명',
              render: (e) => e.expenseName
            }, {
              key: 'target',
              header: '부담처',
              render: (e) => e.label
            },
            {
              key: 'amount',
              header: '부담액',
              render: (e) => money(e.amount)
            }, {
              key: 'received',
              header: '회수액',
              render: (e) => money(e.received)
            }, {
              key: 'remaining',
              header: '남은 금액',
              render: (e) => money(e.remaining)
            },
            {
              key: 'state',
              header: '상태',
              render: (e) => (
                <span
                  className={styles.badge}
                  data-done={!e.excluded && BigInt(e.remaining) === BigInt(0)}
                  data-excluded={e.excluded}
                >
                  {e.excluded ? '정산 제외' : BigInt(e.remaining) === BigInt(0) ? '정산 완료' : BigInt(e.received) > BigInt(0) ? '일부 회수' : '회수 필요'}
                </span>
              )
            }
          ]}
        />
      </section>
      {data.incomes.some((i) => i.kind === 'HOUSEHOLD') && (
        <section
          className={styles.card}
        >
          <h2>
            입금 귀속 동 확인
          </h2>
          <p
            className={styles.muted}
          >
            세대가 연결된 확정 입금은 해당 동에 자동 반영됩니다. 세대 연결이나 동 정보가 없는 입금만 확인해주세요.
          </p>
          <PagedTable
            label={'입금 귀속 동 확인'}
            rows={data.incomes.filter((i) => i.kind === 'HOUSEHOLD'
              && (incomeBuilding === 'ALL' || (incomeBuilding === 'UNKNOWN' ? !i.linkedBuildingId : i.linkedBuildingId === incomeBuilding))
              && `${i.payer} ${i.linkedUnitLabel ?? ''}`.replace(/\s/g, '').includes(incomeSearch.trim().replace(/\s/g, '')))}
            toolbar={(
              <>
                <Input
                  label={'입금 검색'}
                  placeholder={'입금자 또는 연결 세대 검색'}
                  value={incomeSearch}
                  onChange={(event) => setIncomeSearch(event.target.value)}
                />
                <SelectDropdown
                  label={'연결 세대 동'}
                  value={incomeBuilding}
                  onChange={setIncomeBuilding}
                  options={[
                    {
                      value: 'ALL',
                      label: '전체 동'
                    },
                    {
                      value: 'UNKNOWN',
                      label: '세대 미확인'
                    },
                    ...sortExpenseLabels(data.buildings).map((b) => ({
                      value: b.id,
                      label: b.label
                    }))
                  ]}
                />
              </>
            )}
            onRowClick={(i) => openPanel('assignment', i.id)}
            columns={[
              {
                key: 'date',
                header: '입금일',
                render: (i) => i.date
              }, {
                key: 'payer',
                header: '입금자',
                render: (i) => i.payer
              }, {
                key: 'unit',
                header: '연결 세대',
                render: (i) => i.linkedUnitLabel ?? '세대 미확인'
              }, {
                key: 'amount',
                header: '입금액',
                render: (i) => money(i.amount)
              }, {
                key: 'action',
                header: '확인',
                render: () => '귀속 동 지정'
              }
            ]}
          />
        </section>
      )}
      {chartOpen && (
        <ChartDialog
          buildings={filtered}
          onClose={() => setChartOpen(false)}
        />
      )}
      {detailBuilding && detail && (
        <DetailDialog
          title={`${detailBuilding.label} 상세 원장`}
          onClose={() => setDetail(null)}
        >
          <BuildingLedger
            building={detailBuilding}
            data={data}
            propertyId={propertyId}
            renderReceiptDetail={renderReceiptDetail}
          />
        </DetailDialog>
      )}
      {action && (
        <BalanceActionDialog
          key={`${action.kind}-${action.id ?? ''}`}
          action={action}
          data={data}
          propertyId={propertyId}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {notice && (
        <Toast
          message={notice.message}
          tone={notice.tone}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );
}
/** 잔고가 아닌 확인된 입금·출금 합계의 비중을 표시해 음수 잔고나 동 수에 영향을 받지 않게 합니다. */
function BalanceChart({ rows }: { rows: readonly BalanceBuilding[] }) {
  const income = rows.reduce((sum, row) => sum + BigInt(row.income), BigInt(0));
  const expense = rows.reduce((sum, row) => sum + BigInt(row.expense), BigInt(0));
  const total = income + expense;
  const net = income - expense;
  const share = total ? Number(income * BigInt(10000) / total) / 100 : 0;
  return (
    <span
      className={styles['donut-panel']}
    >
      <span
        className={styles.donut}
        data-empty={total === BigInt(0)}
        style={{
          '--chart-share': `${share}%`
        } as CSSProperties}
        role={'img'}
        aria-label={`입금 ${money(income)}, 출금 ${money(-expense)}, 월 입출금 차액 ${money(net)}`}
      >
        <span
          className={styles['donut-center']}
        >
          <span>
            월 입출금 차액
          </span>
          <strong
            data-negative={net < BigInt(0)}
          >
            {money(net)}
          </strong>
        </span>
      </span>
      <span
        className={styles['donut-legend']}
      >
        <span>
          <span
            className={styles['donut-marker']}
            data-kind={'income'}
          />
          입금
          {' '}
          <strong>
            {money(income)}
          </strong>
        </span>
        <span>
          <span
            className={styles['donut-marker']}
            data-kind={'expense'}
          />
          출금
          {' '}
          <strong>
            {money(-expense)}
          </strong>
        </span>
      </span>
    </span>
  );
}

/** 조회 동들의 입출금 비중과 동별 금액을 검색·선택해 확인합니다. */
function ChartDialog({ buildings, onClose, presentation = 'modal' }: { buildings: readonly BalanceBuilding[]; onClose: () => void; presentation?: 'modal' | 'page' }) {
  const [building, setBuilding] = useState('ALL');
  const [search, setSearch] = useState('');
  const rows = buildings.filter((row) => (building === 'ALL' || row.id === building) && row.label.includes(search.trim()));
  return (
    <DetailDialog
      title={'동별 입금·지출 비교'}
      presentation={presentation}
      onClose={onClose}
    >
      <div
        className={styles['chart-controls']}
      >
        <Input
          label={'그래프 동 검색'}
          value={search}
          placeholder={'동 이름 검색'}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectDropdown
          label={'그래프 동 선택'}
          value={building}
          onChange={setBuilding}
          options={[{
            value: 'ALL',
            label: '전체 동'
          }, ...buildings.map((row) => ({
            value: row.id,
            label: row.label
          }))]}
        />
      </div>
      <div
        className={styles['chart-expanded']}
      >
        {rows.length ? (
          <BalanceChart
            rows={rows}
          />
        ) : (
          <p
            className={styles.muted}
          >
            조건에 맞는 동이 없습니다.
          </p>
        )}
      </div>
      <PagedTable
        label={'동별 입금 출금 비교'}
        rows={rows}
        columns={[
          {
            key: 'building',
            header: '동',
            render: (row) => row.label
          },
          {
            key: 'income',
            header: '입금',
            render: (row) => money(row.income)
          },
          {
            key: 'expense',
            header: '출금',
            render: (row) => money(-BigInt(row.expense))
          }
        ]}
      />
    </DetailDialog>
  );
}

/** 표마다 동일한 표시 개수·페이지 간격을 사용하고 다운로드 범위는 호출자가 전체 결과로 유지합니다. */
function PagedTable<Row extends {
    id: string;
}>({ label, rows, columns, toolbar, onRowClick }: {
    label: string;
    rows: readonly Row[];
    columns: DataTableColumn<Row>[];
    toolbar?: ReactNode;
    onRowClick?: (row: Row) => void;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const count = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, count);
  return (
    <div
      className={styles['paged-table']}
    >
      <div
        className={styles.filters}
        data-toolbar={Boolean(toolbar)}
      >
        {toolbar}
        <Dropdown
          aria-label={`${label} 표시 개수`}
          value={String(size)}
          onChange={(v) => { setSize(Number(v)); setPage(1); }}
          options={[10, 20, 50].map((v) => ({
            value: String(v),
            label: `${v}개씩 보기`
          }))}
        />
      </div>
      <DataTable
        label={label}
        rows={rows.slice((current - 1) * size, current * size)}
        columns={columns.map((column) => ({
          ...column,
          align: 'center'
        }))}
        getRowKey={(row) => row.id}
        onRowClick={onRowClick}
        emptyState={'조회할 내역이 없습니다.'}
        minWidth={columns.length > 5 ? 880 : 620}
      />
      {rows.length > 0 && (
        <Pagination
          label={`${label} 페이지`}
          unit={'건'}
          total={rows.length}
          page={current}
          pageCount={count}
          pageSize={size}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
function BuildingLedger({ building, data, propertyId, renderReceiptDetail }: {
    building: BalanceBuilding;
    data: BalanceWorkspace;
    propertyId: string;
    renderReceiptDetail?: (paymentId: string, onClose: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState('ALL');
  const [search, setSearch] = useState('');
  const [transactionDetail, setTransactionDetail] = useState<BalanceEntry | null>(null);
  /** 누적 잔고를 먼저 계산한 뒤 표시만 필터링해 입금·출금 필터가 잔고를 바꾸지 않게 합니다. */
  function openTransaction(entry: BalanceEntry) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const path = entry.paymentId ? `receipts/${entry.paymentId}` : `transactions/${entry.id}`;
      const query = new URLSearchParams({
        from: 'balance',
        buildingId: building.id,
        month: data.month
      });
      if (data.accountId) query.set('account', data.accountId);
      router.push(`/manage/${propertyId}/banking/${path}?${query}`);
      return;
    }
    setTransactionDetail(entry);
  }
  const entries = getBuildingLedger(building, data.entries, data.month);
  const columns: DataTableColumn<(typeof entries)[number]>[] = [
    {
      key: 'date',
      header: '거래일시',
      width: 140,
      render: (e) => (
        <span
          className={styles['ledger-date']}
        >
          {e.date}
          <small
            className={styles.muted}
          >
            {e.time}
          </small>
        </span>
      )
    }, {
      key: 'label',
      header: direction === 'INCOME' ? '입금자' : direction === 'EXPENSE' ? '지출명' : '입금자·지출명',
      render: (e) => e.label
    },
    {
      key: 'income',
      header: '입금',
      render: (e) => BigInt(e.income) === BigInt(0) ? '—' : money(e.income)
    }, {
      key: 'expense',
      header: '출금',
      render: (e) => BigInt(e.expense) === BigInt(0) ? '—' : money(-BigInt(e.expense))
    }, {
      key: 'balance',
      header: '잔고',
      render: (e) => (
        <span
          data-negative={e.balance !== null && e.balance < BigInt(0)}
        >
          {money(e.balance)}
        </span>
      )
    }
  ];
  return (
    <div
      className={styles.ledger}
    >
      <div
        className={styles['ledger-summary']}
      >
        <div>
          <span>
            기초 잔고
          </span>
          <strong
            data-negative={building.startBalance !== null && BigInt(building.startBalance!) < BigInt(0)}
          >
            {money(building.startBalance)}
          </strong>
        </div>
        <div>
          <span>
            월 입금
          </span>
          <strong>
            {money(building.income)}
          </strong>
        </div>
        <div>
          <span>
            월 지출
          </span>
          <strong>
            {money(building.expense)}
          </strong>
        </div>
        <div>
          <span>
            월말 잔고
          </span>
          <strong
            data-negative={building.balance !== null && BigInt(building.balance!) < BigInt(0)}
          >
            {money(building.balance)}
          </strong>
        </div>
      </div>
      <p
        className={styles.muted}
      >
        {data.month}
        {' '}
        · 잔고 기준일
        {' '}
        {data.cutoffDate ?? '미설정'}
        {' '}
        의 잔고에서 조회 월의 입출금을 계산합니다.
      </p>
      <PagedTable
        label={'동별 상세 원장'}
        rows={entries.filter((entry) => (direction === 'ALL' || BigInt(direction === 'INCOME' ? entry.income : entry.expense) > BigInt(0)) && entry.label.includes(search.trim()))}
        onRowClick={openTransaction}
        toolbar={(
          <>
            <Input
              label={'원장 검색'}
              placeholder={'입금자·지출명 검색'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Dropdown
              label={'입출금 구분'}
              value={direction}
              onChange={setDirection}
              options={[{
                value: 'ALL',
                label: '전체'
              }, {
                value: 'INCOME',
                label: '입금'
              }, {
                value: 'EXPENSE',
                label: '출금'
              }]}
            />
          </>
        )}
        columns={columns.filter((column) => !(direction === 'INCOME' && column.key === 'expense') && !(direction === 'EXPENSE' && column.key === 'income'))}
      />
      {transactionDetail && (transactionDetail.paymentId ? renderReceiptDetail?.(transactionDetail.paymentId, () => setTransactionDetail(null)) : (
        <BankingExpensePage
          propertyId={propertyId}
          transactionId={transactionDetail.id}
          presentation={'modal'}
          onClose={() => setTransactionDetail(null)}
        />
      ))}
    </div>
  );
}
/** 같은 내용을 PC 모달과 모바일 독립 페이지에서 재사용하며 페이지의 복귀는 공통 헤더가 담당합니다. */
function DetailDialog({ title, children, onClose, busy = false, compact = false, footer, presentation = 'modal' }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    compact?: boolean;
    footer?: ReactNode;
    presentation?: 'modal' | 'page';
}) {
  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-label={title}
    >
      <ListHeader
        className={styles.header}
        titleId={'balance-title'}
        menu={'통장 관리'}
        title={title}
        description={''}
      />
      <div
        className={styles['detail-surface']}
      >
        <div
          className={styles['detail-body']}
        >
          {children}
        </div>
        {footer && (
          <footer
            className={styles['modal-footer']}
          >
            {footer}
          </footer>
        )}
      </div>
    </section>
  );
  return (
    <ClientModal
      className={styles.modal}
      data-compact={compact}
      aria-labelledby={'balance-dialog-title'}
      onClose={onClose}
      busy={busy}
      closeOnOutsideClick
    >
      <header
        className={styles['modal-header']}
      >
        <div>
          <p>
            통장 관리
          </p>
          <h2
            id={'balance-dialog-title'}
          >
            {title}
          </h2>
        </div>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={`${title} 닫기`}
          disabled={busy}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <div
        className={styles['modal-body']}
      >
        {children}
      </div>
      {footer && (
        <footer
          className={styles['modal-footer']}
        >
          {footer}
        </footer>
      )}
    </ClientModal>
  );
}
/** 동 선택을 바꿔도 시작 잔고 초안을 보존하고 누락 동을 안내합니다. 외부 회수는 명시적인 관리자 입력만 저장하며 실패·재시도에는 입력과 요청 ID를 유지합니다. */
type OpeningDraftState = {
  cutoff: string; amounts: Record<string, string>; editing: boolean; revisions: Record<string, number>; requestId: string;
};

type BalanceActionDialogProps = {
  action: Action;
  data: BalanceWorkspace;
  propertyId: string;
  onClose: () => void;
  onSaved: (message: string, keepOpen?: boolean) => Promise<void>;
  presentation?: 'modal' | 'page';
  openingSelector?: ReactNode;
  openingAccountId?: string;
  openingDraft?: OpeningDraftState;
  onOpeningDraftChange?: (draft: OpeningDraftState) => void;
};

/** 기존 기준 잔고 화면 안에서 통장을 선택하고 해당 통장의 동별 입력을 불러옵니다. */
function BalanceActionDialog(props: BalanceActionDialogProps) {
  const session = useSession();
  const accounts = props.data.accounts ?? [];
  const [accountId, setAccountId] = useState(props.action.id ?? props.data.accountId ?? accounts[0]?.id ?? '');
  const [openingDrafts, setOpeningDrafts] = useState<Record<string, OpeningDraftState>>({});
  const rememberOpening = useCallback((draft: OpeningDraftState) => {
    setOpeningDrafts((current) => ({
      ...current,
      [accountId]: draft
    }));
  }, [accountId]);
  const scoped = props.action.kind === 'opening' && accounts.length > 0;
  const query = useQuery({
    queryKey: ['banking-balances', session.data?.id, props.propertyId, props.data.month, accountId],
    queryFn: () => getBankingBalances(props.propertyId, props.data.month, accountId),
    enabled: scoped && Boolean(accountId),
    retry: false,
    gcTime: 0
  });
  if (!scoped) return (
    <BalanceOperationsDialog
      {...props}
    />
  );
  const selector = (
    <SelectDropdown
      label={'통장 선택'}
      value={accountId}
      onChange={setAccountId}
      options={accounts.map((account) => ({
        value: account.id,
        label: account.label
      }))}
    />
  );
  if (!query.data) return (
    <DetailDialog
      title={'기준 잔고 확인'}
      presentation={props.presentation}
      onClose={props.onClose}
    >
      {selector}
      <p
        role={query.isPending ? 'status' : 'alert'}
      >
        {query.isPending ? '선택한 통장의 동별 기준 잔고를 불러오고 있어요.' : balanceError(query.error)}
      </p>
    </DetailDialog>
  );
  return (
    <BalanceOperationsDialog
      key={accountId}
      {...props}
      data={query.data}
      openingAccountId={accountId}
      openingSelector={selector}
      openingDraft={openingDrafts[accountId]}
      onOpeningDraftChange={rememberOpening}
    />
  );
}

function BalanceOperationsDialog({ action, data, propertyId, onClose, onSaved, presentation = 'modal', openingSelector, openingAccountId, openingDraft: cachedOpening, onOpeningDraftChange }: BalanceActionDialogProps) {
  const cache = useQueryClient();
  const [cutoff, setCutoff] = useState(cachedOpening?.cutoff ?? data.cutoffDate ?? data.legacyOpening?.cutoffDate ?? '');
  const [amounts, setAmounts] = useState<Record<string, string>>(() => cachedOpening?.amounts ?? {
    ...Object.fromEntries(data.legacyOpening?.buildings.map((row) => [row.buildingId, row.amount]) ?? []),
    ...Object.fromEntries(data.buildings.filter((row) => row.openingBalance != null).map((row) => [row.id, row.openingBalance!]))
  });
  const [editingOpening, setEditingOpening] = useState(cachedOpening?.editing ?? false);
  const [openingRevisions] = useState(() => cachedOpening?.revisions ?? Object.fromEntries(data.buildings.map((row) => [row.id, row.openingRevision ?? 0])));
  const [payment, setPayment] = useState('');
  const [building, setBuilding] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [decisionRequestId] = useState(() => crypto.randomUUID());
  const pending = useRef(false);
  const [requestId] = useState(() => cachedOpening?.requestId ?? crypto.randomUUID());
  // 통장을 바꾸는 동안 입력과 요청 ID를 보존해 돌아왔을 때도 같은 초안을 이어갑니다.
  useEffect(() => {
    if (!openingAccountId || !onOpeningDraftChange) return;
    onOpeningDraftChange({
      cutoff,
      amounts,
      editing: editingOpening,
      revisions: openingRevisions,
      requestId
    });
  }, [openingAccountId, onOpeningDraftChange, cutoff, amounts, editingOpening, openingRevisions, requestId]);
  const missing = sortExpenseLabels(data.buildings.filter((b) => b.active && b.status === 'OPENING_REQUIRED'));
  const [openingBuilding, setOpeningBuilding] = useState(missing[0]?.id ?? '');
  const registeredOpenings = sortExpenseLabels(data.buildings.filter((row) => row.openingBalance != null));
  const openingTargets = editingOpening ? registeredOpenings : missing;
  const inputOpening = editingOpening || missing.length > 0;
  const openingOptions = inputOpening ? openingTargets : registeredOpenings;
  const selectedOpening = openingOptions.find((b) => b.id === openingBuilding) ?? openingOptions[0];
  const enteredCount = openingTargets.filter((b) => /^-?[0-9]{1,15}$/.test(amounts[b.id] ?? '')).length;
  const external = data.externals.find((e) => e.id === action.id);
  const income = data.incomes.find((i) => i.id === action.id);
  const options = data.incomes.filter((i) => i.kind === 'OTHER' && BigInt(i.available) > BigInt(0) && (!external?.accountId || i.accountId === external.accountId));
  const title = {
    opening: editingOpening ? '기준 잔고 수정' : missing.length ? '동별 시작 잔고 설정' : '기준 잔고 확인',
    settlement: '외부 부담금 정산',
    assignment: '입금 귀속 동 확인',
    difference: '잔고 차이 내역'
  }[action.kind];
  async function submit() {
    if (pending.current)
      return;
    setError('');
    if (action.kind === 'opening' && (!cutoff || openingTargets.some((b) => !/^-?[0-9]{1,15}$/.test(amounts[b.id] ?? '')))) {
      setError('기준일과 각 동의 시작 잔고를 입력해주세요.');
      const firstMissing = openingTargets.find((b) => !/^-?[0-9]{1,15}$/.test(amounts[b.id] ?? ''));
      if (firstMissing) setOpeningBuilding(firstMissing.id);
      return;
    }
    if (action.kind === 'settlement' && (!payment || !/^[0-9]{1,15}$/.test(amount) || BigInt(amount) <= BigInt(0))) {
      setError('연결할 기타 입금과 0원보다 큰 금액을 입력해주세요.');
      return;
    }
    if (action.kind === 'assignment' && !building) {
      setError('귀속 동을 선택해주세요.');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (action.kind === 'opening' && editingOpening) {
        await correctCashOpenings(propertyId, {
          id: requestId,
          accountId: openingAccountId,
          cutoffDate: cutoff,
          buildings: openingTargets.map((row) => ({
            buildingId: row.id,
            amount: amounts[row.id],
            revision: openingRevisions[row.id]
          }))
        });
      }
      if (action.kind === 'opening' && !editingOpening) {
        await saveCashOpenings(propertyId, {
          accountId: openingAccountId,
          cutoffDate: cutoff,
          buildings: missing.map((row) => ({
            buildingId: row.id,
            amount: amounts[row.id]
          }))
        });
      }
      if (action.kind === 'settlement' && external)
        await settleExternalExpense(propertyId, {
          id: requestId,
          allocationId: external.id,
          paymentId: payment,
          amount
        });
      if (action.kind === 'assignment' && income)
        await assignCashIncome(propertyId, {
          paymentId: income.id,
          buildingId: building
        });
      await onSaved('저장했어요.');
    }
    catch (failure) {
      setError(balanceError(failure));
    }
    finally {
      pending.current = false;
      setBusy(false);
    }
  }
  /** 실제 입금이 없어도 정산에서 제외할 수 있고, 실패 시 같은 요청 ID로 재시도합니다. */
  async function changeSettlementTarget() {
    if (pending.current || !external) return;
    pending.current = true;
    setBusy(true);
    setDecisionBusy(true);
    setError('');
    try {
      await decideExternalSettlement(propertyId, {
        id: decisionRequestId,
        allocationId: external.id,
        excluded: !external.excluded,
        revision: external.decisionRevision ?? 0
      });
      await onSaved(external.excluded ? '정산 대상으로 복원했어요.' : '정산에서 제외했어요.');
    } catch (failure) {
      setError(balanceError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      setDecisionBusy(false);
    }
  }
  /** 외부 부담액만 지우지 않고 잘못 등록된 출금 전체를 기존 소프트 삭제로 제거해 동별 지출도 함께 재계산합니다. */
  async function deleteExternalTransaction() {
    if (pending.current || !external?.transactionId) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const relatedQueries: QueryFilters = {
      predicate: (query) => query.queryKey.includes(propertyId)
        && ['banking-workspace', 'payment-workspace', 'billing'].includes(String(query.queryKey[0]))
    };
    try {
      // 진행 중인 이전 조회가 삭제 후 캐시를 덮어쓰지 않게 하고, 성공 후 관련 화면을 다시 읽습니다.
      await cache.cancelQueries(relatedQueries);
      await deleteBankingTransactions(propertyId, [external.transactionId]);
      await cache.invalidateQueries(relatedQueries);
      await onSaved('잘못 등록된 거래를 삭제했어요.');
    } catch (failure) {
      setError(bankingError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if ((action.kind === 'settlement' && !external) || (action.kind === 'assignment' && !income)) return (
    <DetailDialog
      title={title}
      presentation={presentation}
      onClose={onClose}
    >
      <p>
        해당 내역을 찾을 수 없습니다.
      </p>
    </DetailDialog>
  );
  if (action.kind === 'settlement' && deleting && external) return (
    <DetailDialog
      title={'거래를 삭제할까요?'}
      presentation={presentation}
      onClose={onClose}
      busy={busy}
      compact
      footer={(
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            tone={'neutral'}
            disabled={busy}
            onClick={() => { setDeleting(false); setError(''); }}
          >
            취소
          </Button>
          <Button
            tone={'danger'}
            loading={busy}
            disabled={busy}
            onClick={() => { void deleteExternalTransaction(); }}
          >
            삭제
          </Button>
        </div>
      )}
    >
      <div
        className={styles.form}
      >
        <h3>
          {external.expenseName}
        </h3>
        <p>
          {external.date}
          {' · 출금 '}
          {money(external.transactionAmount ?? null)}
        </p>
        <p>
          외부 부담금
          {' '}
          {money(external.amount)}
          과 이 출금에 연결된 모든 동별 지출을 계산에서 제거합니다. 처리 이력은 보관됩니다.
        </p>
        {BigInt(external.received) > BigInt(0) && (
          <p
            className={styles.muted}
          >
            연결한 회수 입금은 삭제하지 않고 다른 정산에 사용할 수 있도록 되돌립니다.
          </p>
        )}
        {error && (
          <p
            role={'alert'}
            className={styles.error}
          >
            {error}
          </p>
        )}
      </div>
    </DetailDialog>
  );
  return (
    <DetailDialog
      title={title}
      presentation={presentation}
      onClose={onClose}
      busy={busy}
      compact={action.kind !== 'difference'}
      footer={(
        action.kind !== 'difference' && (
          <div
            className={styles.actions}
          >
            {action.kind === 'opening' && !inputOpening && (
              <Button
                onClick={() => setEditingOpening(true)}
              >
                기준 잔고 수정
              </Button>
            )}
            {action.kind === 'opening' && editingOpening && (
              <Button
                variant={'outline'}
                tone={'neutral'}
                disabled={busy}
                onClick={() => {
                  setEditingOpening(false);
                  setCutoff(data.cutoffDate ?? '');
                  setAmounts(Object.fromEntries(registeredOpenings.map((row) => [row.id, row.openingBalance!])));
                  setError('');
                }}
              >
                취소
              </Button>
            )}
            {action.kind === 'settlement' && external && (
              <Button
                variant={'outline'}
                tone={'neutral'}
                loading={decisionBusy}
                disabled={busy}
                onClick={() => { void changeSettlementTarget(); }}
              >
                {external.excluded ? '정산 대상으로 복원' : '정산에서 제외'}
              </Button>
            )}
            {action.kind === 'settlement' && external?.transactionId && (
              <Button
                variant={'outline'}
                tone={'danger'}
                disabled={busy}
                onClick={() => { setDeleting(true); setError(''); }}
                leadingIcon={(
                  <ServiceIcon
                    name={'trash'}
                  />
                )}
              >
                거래 삭제
              </Button>
            )}
            {(action.kind !== 'opening' || inputOpening) && (action.kind !== 'settlement' || (external && !external.excluded && BigInt(external.remaining) > BigInt(0))) && (
              <Button
                loading={busy && !decisionBusy}
                disabled={busy || (action.kind === 'settlement' && !options.length)}
                onClick={() => { void submit(); }}
              >
                {action.kind === 'settlement' ? '입금 연결 확정' : editingOpening ? '변경 저장' : '확정'}
              </Button>
            )}
          </div>
        )
      )}
    >
      {action.kind === 'opening' && (
        <fieldset
          className={styles.form}
          disabled={busy}
        >
          {openingSelector}
          {data.legacyOpening && missing.length > 0 && (
            <p
              className={styles['exclusion-note']}
            >
              통장 구분 전에 저장한 기준일과 잔고를 표시했습니다. 선택한 통장의 동별 금액이 맞는지 확인한 뒤 확정해주세요.
            </p>
          )}
          <p>
            선택한 통장의 동별 기준일과 그날 마감 잔고를 입력합니다. 이후 월은 해당 통장의 입출금을 누적하고 이전 월은 확인된 입출금을 거꾸로 계산합니다.
          </p>
          {data.cutoffDate && !editingOpening ? (
            <p>
              잔고 기준일:
              {' '}
              {data.cutoffDate}
            </p>
          ) : (
            <CalendarPicker
              label={'기준일'}
              value={cutoff}
              onChange={setCutoff}
              required
            />
          )}
          {editingOpening && (
            <p
              className={styles['exclusion-note']}
            >
              선택한 기준일 마감 시점의 잔고를 동별로 확인해주세요. 변경하면 해당 기준일부터 모든 월의 잔고를 다시 계산하며 변경 전 값은 이력에 보관합니다.
            </p>
          )}
          <div
            className={styles['opening-editor']}
          >
            <SelectDropdown
              label={'동 선택'}
              placeholder={'동 이름으로 검색'}
              value={selectedOpening?.id ?? ''}
              onChange={setOpeningBuilding}
              options={openingOptions.map((b) => ({
                value: b.id,
                label: b.label,
                searchKeywords: [b.label.replace('동', '')]
              }))}
            />
            {selectedOpening && (
              <AmountInput
                label={`${selectedOpening.label} ${missing.length ? '시작 잔고' : '기준 잔고'}`}
                value={inputOpening ? (amounts[selectedOpening.id] ?? '') : (selectedOpening.openingBalance ?? '')}
                readOnly={!inputOpening}
                onChange={(value) => setAmounts((previous) => ({
                  ...previous,
                  [selectedOpening.id]: value
                }))}
              />
            )}
          </div>
          <div
            className={styles['opening-progress']}
            role={'status'}
            hidden={!inputOpening}
          >
            <span>
              입력 완료
              {' '}
              <strong>
                {enteredCount}
                {' '}
                /
                {' '}
                {openingTargets.length}
                개 동
              </strong>
            </span>
            <span>
              동을 바꿔도 입력한 금액은 유지됩니다.
            </span>
          </div>
          <p
            className={styles.muted}
          >
            세대별 미납·선납 금액을 입력하는 곳이 아닙니다. 부족한 동은 음수로 입력할 수 있습니다.
          </p>
        </fieldset>
      )}
      {action.kind === 'settlement' && external && (
        <fieldset
          className={styles.form}
          disabled={busy}
        >
          <h3>
            {external.label}
            {' '}
            ·
            {' '}
            {external.expenseName}
          </h3>
          <dl
            className={styles.overview}
          >
            <div>
              <dt>
                부담액
              </dt>
              <dd>
                {money(external.amount)}
              </dd>
            </div>
            <div>
              <dt>
                회수액
              </dt>
              <dd>
                {money(external.received)}
              </dd>
            </div>
            <div>
              <dt>
                남은 금액
              </dt>
              <dd>
                {money(external.remaining)}
              </dd>
            </div>
          </dl>
          {external.recoveries.length > 0 && (
            <ul
              className={styles.recoveries}
            >
              {external.recoveries.map((r) => (
                <li
                  key={r.id}
                >
                  {r.date}
                  {' '}
                  ·
                  {' '}
                  {r.payer}
                  <strong>
                    {money(r.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
          {external.excluded && (
            <p
              className={styles['exclusion-note']}
            >
              정산에서 제외한 내역입니다. 통장 거래·지출 원본과 회수 기록은 유지되며, 남은 금액은 미회수 합계에 포함하지 않습니다.
            </p>
          )}
          {!external.excluded && BigInt(external.remaining) > BigInt(0) && (
            <>
              <SelectDropdown
                label={'연결할 기타 입금'}
                value={payment}
                onChange={(value) => { setPayment(value); const available = BigInt(options.find((i) => i.id === value)!.available); setAmount((available < BigInt(external.remaining) ? available : BigInt(external.remaining)).toString()); }}
                options={options.map((i) => ({
                  value: i.id,
                  label: `${i.date} · ${i.payer} · 잔여 ${money(i.available)}`
                }))}
              />
              <AmountInput
                label={'연결 금액'}
                value={amount}
                onChange={setAmount}
              />
              {!options.length && (
                <p
                  className={styles.muted}
                >
                  연결 가능한 기타 입금이 없습니다. 통장 거래에서 실제 입금을 기타 입금으로 확정한 뒤 연결해주세요.
                </p>
              )}
            </>
          )}
        </fieldset>
      )}
      {action.kind === 'assignment' && income && (
        <fieldset
          className={styles.form}
          disabled={busy}
        >
          <p>
            {income.date}
            {' '}
            ·
            {' '}
            {income.payer}
            {' '}
            ·
            {' '}
            {money(income.amount)}
          </p>
          <p
            className={styles.muted}
          >
            연결 세대:
            {income.linkedUnitLabel ?? '세대 미확인'}
            {' '}
            · 현재 정보이므로 입금 당시 동을 확인해주세요.
          </p>
          <SelectDropdown
            label={'귀속 동'}
            value={building}
            onChange={setBuilding}
            options={sortExpenseLabels(data.buildings.filter((b) => b.active)).map((b) => ({
              value: b.id,
              label: b.label
            }))}
          />
          <p
            className={styles.muted}
          >
            당시 실제 입금이 속한 동을 확인해주세요. 확정 후에는 다른 동으로 덮어쓰지 않습니다.
          </p>
        </fieldset>
      )}
      {action.kind === 'difference' && (
        <>
          <p>
            화면에 표시된 통장 잔액에서 동별 잔고 합계를 뺀 차이입니다. 통장 잔액에는 계산 잔액·미분류 거래·외부 부담금·공통 자금이 포함될 수 있으며 차이를 자동 배분하거나 대사 완료로 처리하지 않습니다.
          </p>
          <dl
            className={styles.overview}
          >
            <div>
              <dt>
                통장 잔액 − 동별 합계
              </dt>
              <dd
                data-negative={getBalanceSummary(data).difference !== null && getBalanceSummary(data).difference! < BigInt(0)}
              >
                {money(getBalanceSummary(data).difference)}
              </dd>
            </div>
            <div>
              <dt>
                외부 대납 미회수액
              </dt>
              <dd>
                {money(getBalanceSummary(data).external)}
              </dd>
            </div>
          </dl>
          <h3>
            처리 전 은행 거래
          </h3>
          <PagedTable
            label={'처리 전 은행 거래'}
            rows={data.pending}
            columns={[{
              key: 'date',
              header: '거래일',
              render: (r) => r.date
            }, {
              key: 'label',
              header: '입금자·지출명',
              render: (r) => r.label
            }, {
              key: 'amount',
              header: '금액',
              render: (r) => `${r.direction === 'EXPENSE' ? '출금' : '입금'} ${money(r.amount)}`
            }]}
          />
          <h3>
            귀속 확인할 입금
          </h3>
          <PagedTable
            label={'귀속 확인할 입금'}
            rows={data.incomes.filter((i) => BigInt(i.available) > BigInt(0))}
            columns={[{
              key: 'date',
              header: '입금일',
              render: (r) => r.date
            }, {
              key: 'payer',
              header: '입금자',
              render: (r) => r.payer
            }, {
              key: 'amount',
              header: '미귀속 금액',
              render: (r) => money(r.available)
            }]}
          />
        </>
      )}
      {error && (
        <p
          role={'alert'}
          className={styles.error}
        >
          {error}
        </p>
      )}

    </DetailDialog>
  );
}
