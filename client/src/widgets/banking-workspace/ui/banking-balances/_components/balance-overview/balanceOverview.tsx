'use client';

import {
  BALANCE_SORT_OPTIONS,
  BALANCE_FILTER_OPTIONS
} from '../../../../constant/bankingOptions';

import type { DataTableColumn } from '@/shared/ui/data-table';
import type { BalanceBuilding } from '../../../../api/bankingBalanceApiTypes';

import { useBankingBalances } from '../../_hooks/useBankingBalances';
import { formatInteger } from '@/shared/lib/format';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { getBalancePeriodLabel } from '../../../../model/accountBalance';
import { AccountBalances } from '../../../_components/account-balances/accountBalances';
import { BalanceChart } from '../balance-chart/balanceChart';
import { PagedTable } from '../balance-common/balanceCommon';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './balanceOverview.module.css';
type Props = Pick<Extract<ReturnType<typeof useBankingBalances>, {
  kind: 'ready';
}> & Parameters<typeof useBankingBalances>[0], 'month' | 'startMonth' | 'search' | 'setSearch' | 'sort' | 'setSort' | 'filter' | 'setFilter' | 'data' | 'summary' | 'selectedAccount' | 'bankBalance' | 'bankLabel' | 'bankAsOf' | 'bankHelp' | 'differenceDescription' | 'selectedBuilding' | 'filtered' | 'openDetail' | 'openPanel'>;
/** BalanceOverview에 필요한 표시와 공통 UI를 조합합니다. */
export function BalanceOverview({
  month,
  startMonth,
  search,
  setSearch,
  sort,
  setSort,
  filter,
  setFilter,
  data,
  summary,
  selectedAccount,
  bankBalance,
  bankLabel,
  bankAsOf,
  bankHelp,
  differenceDescription,
  selectedBuilding,
  filtered,
  openDetail,
  openPanel
}: Props) {
  // 검색 결과가 비어도 기존 동별 조회는 유지하고, 동 자체가 없는 대상에서만 비교 영역을 숨깁니다.
  const hasBuildings = data.buildings.length > 0;
  const buildingColumns: DataTableColumn<BalanceBuilding>[] = [
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
      render: (b) => formatBalanceMoney(b.startBalance)
    },
    {
      key: 'income',
      header: startMonth === month ? '월 입금' : '기간 입금',
      render: (b) => b.status === 'READY' ? formatBalanceMoney(b.income) : '—'
    },
    {
      key: 'expense',
      header: startMonth === month ? '월 지출' : '기간 지출',
      render: (b) => b.status === 'READY' ? formatBalanceMoney(b.expense) : '—'
    },
    {
      key: 'balance',
      header: startMonth === month ? '월말 잔고' : '기말 잔고',
      render: (b) => (
        <strong
          data-negative={b.balance !== null && BigInt(b.balance) < BigInt(0)}
        >
          {formatBalanceMoney(b.balance)}
        </strong>
      )
    }
  ];

  return (<>
    <div
      className={styles.summary}
      data-has-buildings={hasBuildings}
    >
      <SummaryCard
        density={'compact'}
        label={bankLabel}
        value={bankBalance === null ? '확인 필요' : formatInteger(bankBalance)}
        unit={bankBalance === null ? '' : '원'}
        help={(
          <InfoTooltip
            size={'sm'}
            label={`${bankLabel} 도움말`}
            title={bankLabel}
            note={bankAsOf}
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
      {hasBuildings && (<>
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
              {summary.total !== null ? ` ${getBalancePeriodLabel(month)} · 동별 귀속 금액` : ' 통장을 선택해 동별 시작 잔고를 등록해주세요.'}
            </InfoTooltip>
          )}
          tone={'warning'}
          value={summary.total === null ? '설정 필요' : formatInteger(summary.total)}
          unit={summary.total === null ? '' : '원'}
          icon={(
            <ServiceIcon
              name={'coins'}
            />
          )}
        />
        <SummaryCard
          density={'compact'}
          label={'잔고 차이'}
          help={(
            <InfoTooltip
              size={'sm'}
              label={'잔고 차이 도움말'}
              title={'잔고 차이'}
              note={summary.difference === null ? undefined : differenceDescription}
            >
              통장 잔액과 동별 잔고를 비교한 참고 금액입니다.
            </InfoTooltip>
          )}
          value={summary.difference === null ? '확인 필요' : formatInteger(summary.difference)}
          unit={summary.difference === null ? '' : '원'}
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
          help={(
            <InfoTooltip
              size={'sm'}
              label={'관리 동 수 도움말'}
              title={'관리 동 수'}
            >
              등록된 관리 동 기준입니다.
            </InfoTooltip>
          )}
          icon={(
            <ServiceIcon
              name={'building'}
            />
          )}
        />
      </>)}
    </div>
    {!!data.accounts?.length && (
      <AccountBalances
        data={data}
        onOpen={(id) => openPanel('account', id)}
      />
    )}
    {hasBuildings && (<>
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
          hasFilters={Boolean(selectedBuilding || search.trim() || filter !== 'ALL')}
          rows={filtered}
          columns={buildingColumns}
          onRowClick={openDetail}
          toolbar={(
            <>
              <Input
                aria-label={'동 검색'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={'예: 102동'}
              />
              <Dropdown
                aria-label={'잔고 정렬'}
                value={sort}
                onChange={setSort}
                options={BALANCE_SORT_OPTIONS}
              />
              <Dropdown
                aria-label={'잔고 상태'}
                value={filter}
                onChange={setFilter}
                options={BALANCE_FILTER_OPTIONS}
              />
            </>
          )}
        />
      </section>
      <div
        className={styles['lower-grid']}
      >
        <section
          className={styles.card}
        >
          <h2>
            {startMonth === month ? '월 입금·출금 비중' : '기간 입금·출금 비중'}
          </h2>
          <p
            className={styles.muted}
          >
            현재 조회 동
            {' '}
            {filtered.length}
            {startMonth === month ? '개 · 월 입금 / 출금' : '개 · 기간 입금 / 출금'}
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
                통장 장부 잔액 − 동별 합계
              </dt>
              <dd
                data-negative={summary.difference !== null && summary.difference < BigInt(0)}
              >
                {formatBalanceMoney(summary.difference)}
              </dd>
            </div>
            <div>
              <dt>
                외부 보관금 잔액
              </dt>
              <dd>
                {formatBalanceMoney(data.incomes.filter((i) => i.kind === 'EXTERNAL').reduce((sum, i) => sum + BigInt(i.available), BigInt(0)))}
              </dd>
            </div>
            <div>
              <dt>
                조회 기간 외부 대납 미회수액
              </dt>
              <dd>
                {formatBalanceMoney(summary.external)}
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
                {data.incomes.filter((i) => i.kind !== 'EXTERNAL' && BigInt(i.available) > BigInt(0)).length}
                건
              </dd>
            </div>
          </dl>
          <p
            className={styles.muted}
          >
            외부 보관금·외부 대납금·기타 입금·미분류 거래·시작 잔고 차이를 확인해주세요. 차이를 특정 동에 자동 반영하지 않습니다.
          </p>
          <button
            type={'button'}
            className={styles['difference-trigger']}
            aria-label={'잔고 차이 내역 확인'}
            onClick={() => openPanel('difference')}
          />
        </section>
      </div>
    </>)}
    {data.incomes.some((i) => i.kind === 'EXTERNAL') && (
      <section
        className={styles.card}
      >
        <h2>
          외부 보관금
        </h2>
        <p
          className={styles.muted}
        >
          관리 동 잔고에 포함하지 않는 돈입니다. 외부 부담금 정산에서 입금을 연결하면 사용액이 반영됩니다.
        </p>
        <PagedTable
          label={'외부 보관금'}
          rows={data.incomes.filter((i) => i.kind === 'EXTERNAL')}
          columns={[{
            key: 'date',
            header: '입금일',
            render: (i) => i.date
          }, {
            key: 'payer',
            header: '외부 동·입금 항목',
            render: (i) => i.payer
          }, {
            key: 'amount',
            header: '입금액',
            render: (i) => formatBalanceMoney(i.amount)
          }, {
            key: 'used',
            header: '연결 사용액',
            render: (i) => formatBalanceMoney(BigInt(i.amount) - BigInt(i.available))
          }, {
            key: 'available',
            header: '보관 잔액',
            render: (i) => formatBalanceMoney(i.available)
          }]}
        />
      </section>
    )}
  </>);
}
