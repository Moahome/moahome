'use client';

import { StateMessage } from '@/shared/ui/state-message';
import { Button } from '@/shared/ui/button';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import {
  formatMonthRange,
  getMonthRangeQuery,
  type MonthRange
} from '@/shared/lib/month-range';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import {
  usePathname,
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useState } from 'react';
import {
  filterMonthlyPreviewRows,
  getPreviewBuildingOptions
} from '../../../model/paymentPreview';
import {
  getMonthlyRowKey,
  getMonthlyRangeRows,
  getMonthlyRangeIncome,
  getMonthlyChargeSummary,
  sumMonthlyRangeRows
} from '../../../model/monthlyRange';
import type { MonthlyCollectionFilters } from '../../../model/paymentPreviewTypes';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import { MonthlyExportButton } from '../monthly-download/monthlyDownload';
import { MonthlyDetail } from '../monthly-detail/monthlyDetail';
import {
  MONTHLY_STATUS_TONES,
  PaymentBadge
} from '../payment-badge/paymentBadge';
import styles from './monthlyCollection.module.css';

/** 월별 실제 입금 합계와 청구의 이월·충당·미수를 함께 표시하되 두 기준의 금액을 섞지 않습니다. */
export function MonthlyCollection({ propertyId, range, onRangeChange, detailPath, filters, onFiltersChange,
  selectedRowKeys, onSelectionChange, onToggleSelection }: {
  propertyId: string;
  range: MonthRange;
  onRangeChange: (range: MonthRange) => void;
  detailPath?: string;
  filters: MonthlyCollectionFilters;
  onFiltersChange: (filters: MonthlyCollectionFilters) => void;
  selectedRowKeys?: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  onToggleSelection: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ledger } = usePaymentWorkspace();
  const { query, status, building } = filters;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<{ unitId: string; month: string } | null>(() => {
    const unitId = searchParams.get('unit');
    return unitId ? {
      unitId,
      month: range.endMonth
    } : null;
  });
  const multipleMonths = range.startMonth !== range.endMonth;
  const rows = getMonthlyRangeRows(ledger, range);
  const income = getMonthlyRangeIncome(ledger, range);
  // 여러 달에서는 세대·월별 상태를 세므로 같은 세대라도 월이 다르면 별도 행으로 표시합니다.
  const matches = filterMonthlyPreviewRows(rows, {
    ...filters,
    status: '전체'
  });
  const filtered = filterMonthlyPreviewRows(matches, filters);
  // 필터·수납 결과로 세대 수가 줄어들면 빈 페이지 대신 마지막 유효 페이지를 표시합니다.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selecting = selectedRowKeys !== undefined;
  const checkedIds = new Set(selectedRowKeys ?? []);
  const visibleSelectedCount = visible.filter((row) => checkedIds.has(getMonthlyRowKey(row))).length;
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance') => sumMonthlyRangeRows(rows, range, key);
  const chargeSummary = getMonthlyChargeSummary(rows);
  /** 상단 납부·미수는 신규 청구 기준으로 표시하고 이월 원장 값은 그대로 유지합니다. */
  function summaryValue(key: string) {
    if (key === 'balance') return chargeSummary.receivable;
    if (key === 'applied') return chargeSummary.applied;
    return sum(key as 'carry' | 'billed');
  }

  // 선입금 잔액은 당월까지의 청구를 이미 충당한 결과이므로 발생액을 다시 차감하지 않습니다.
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    ...(multipleMonths ? [{
      key: 'month',
      header: '부과 월',
      width: 115,
      render: (row: (typeof rows)[number]) => row.month
    }] : []),
    {
      key: 'unit',
      header: '세대',
      width: 150,
      rowHeader: true,
      render: (row) => (
        <span
          className={styles['unit-label']}
        >
          {row.unitLabel}
        </span>
      )
    },
    {
      key: 'representative',
      header: '세대 대표',
      render: (row) => row.representativeName
    },
    {
      key: 'carry',
      header: '전월 이월액',
      align: 'right',
      render: (row) => (
        <span
          className={styles.amount}
          data-negative={row.carry < BigInt(0)}
        >
          {formatWon(row.carry)}
        </span>
      )
    },
    {
      key: 'billed',
      header: '당월 발생액',
      align: 'right',
      render: (row) => formatWon(row.billed + (row.settlementAmount ?? BigInt(0)))
    },
    {
      key: 'applied',
      header: '이월 포함 반영액',
      align: 'right',
      render: (row) => formatWon(row.applied)
    },
    {
      key: 'balance',
      header: '누적 미수금',
      align: 'right',
      render: (row) => !row.settlementPending ? formatWon(row.balance) : '정산 확인 필요'
    },
    {
      key: 'prepaid',
      header: '선입금 잔액',
      align: 'right',
      render: (row) => formatWon(row.prepaid)
    },
    {
      key: 'status',
      header: '상태',
      render: (row) => (
        <PaymentBadge
          tone={MONTHLY_STATUS_TONES[row.status]}
        >
          {row.status}
        </PaymentBadge>
      )
    },
    {
      key: 'date',
      header: '최근 입금일',
      render: (row) => row.latestDate
    },

  ];
  const amountColumns = status === '선입금'
    ? columns.filter((column) => ['month', 'unit', 'representative', 'prepaid', 'status', 'date'].includes(column.key))
    : columns;
  const visibleColumns: typeof columns = selecting ? [{
    key: 'selection',
    width: 48,
    header: (
      <input
        className={styles['selection-checkbox']}
        type={'checkbox'}
        aria-label={multipleMonths ? '현재 페이지 월별 내역 전체 선택' : '현재 페이지 세대 전체 선택'}
        checked={visible.length > 0 && visibleSelectedCount === visible.length}
        ref={(element) => { if (element) element.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length; }}
        onChange={(event) => {
          const next = new Set(selectedRowKeys);
          visible.forEach((row) => {
            if (event.target.checked) next.add(getMonthlyRowKey(row));
            else next.delete(getMonthlyRowKey(row));
          });
          onSelectionChange([...next]);
        }}
      />
    ),
    render: (row) => (
      <input
        className={styles['selection-checkbox']}
        type={'checkbox'}
        aria-label={`${multipleMonths ? `${row.month} ` : ''}${row.unitLabel} 선택`}
        checked={checkedIds.has(getMonthlyRowKey(row))}
        onChange={() => toggleSelection(getMonthlyRowKey(row))}
      />
    )
  }, ...amountColumns] : amountColumns;

  /** 페이지를 넘겨도 선택한 월·세대 행을 유지하며 다른 월의 같은 세대는 독립적으로 선택합니다. */
  function toggleSelection(rowKey: string) {
    const next = new Set(selectedRowKeys);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    onSelectionChange([...next]);
  }

  /** PC에서는 중앙 모달로, 모바일에서는 독립된 세대별 수납 상세 주소로 이동합니다. */
  function openDetail(unitId: string, month: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const period = getMonthRangeQuery(searchParams);
      router.push(`${detailPath ?? `/manage/${propertyId}/payments/monthly`}/${month}/${encodeURIComponent(unitId)}${period.size ? `?${period}` : ''}`);
      return;
    }
    setSelected({
      unitId,
      month
    });
  }

  return (
    <div
      className={styles.monthly}
    >
      <div
        className={styles.kpis}
      >
        {[
          [multipleMonths ? '시작 월 이월액' : '전월 이월액', 'carry', 'teal',
            `${multipleMonths ? '조회 시작 월의 전월 말' : '전월 말'} 미납 잔액에서 선입금 잔액을 뺀 금액입니다. 음수는 선입금이 더 많이 남아 있다는 뜻입니다.`],
          [multipleMonths ? '기간 관리비 발생액' : '당월 관리비 발생액', 'billed', 'primary',
            `${multipleMonths ? '조회 기간에' : '이번 달에'} 새로 부과한 관리비 청구액의 합계입니다. ${multipleMonths ? '시작 월' : '전월'} 이월액은 포함하지 않습니다.`],
          [multipleMonths ? '기간 청구 납부반영액' : '당월 청구 납부반영액', 'applied', 'success',
            `${multipleMonths ? '조회 기간 각 월의 청구액에 납부로 반영된 금액의 합계입니다.' : '이번 달 청구액에 납부로 반영된 금액입니다.'} 이전 선입금으로 충당한 금액도 포함하며, ${multipleMonths ? '같은 기간' : '이번 달'} 실제 입금액과는 다를 수 있습니다.`],
          [multipleMonths ? '기간 청구 미수금' : '당월 청구 미수금', 'balance', 'danger',
            multipleMonths ? '조회 기간 각 월의 신규 청구액 중 해당 월말에 납부 반영되지 않은 금액의 합계입니다. 조회 시작 월 이전의 미납은 포함하지 않습니다.' : '이번 달 청구액 중 아직 납부 반영되지 않은 금액입니다. 이전 달 미납은 포함하지 않습니다.']
        ].map(([label, key, tone, help]) => {
          const value = summaryValue(key);
          const negative = value !== null && value < BigInt(0);
          // 선입금 우위의 음수 이월과 양수 청구 미수는 금액을 붉게 표시하되 카드 아이콘으로 항목을 구분합니다.
          const unpaid = key === 'balance' && value !== null && value > BigInt(0);

          return (
            <SummaryCard
              density={'compact'}
              key={key}
              label={label}
              help={(
                <InfoTooltip
                  size={'sm'}
                  label={`${label} 도움말`}
                  title={label}
                  note={key === 'carry' ? '예: 미납 50,000원 − 선입금 200,000원 = 이월액 −150,000원' : undefined}
                >
                  {help}
                </InfoTooltip>
              )}
              value={value === null ? '정산 확인 필요' : formatInteger(value)}
              unit={value === null ? '' : '원'}
              valueTone={negative || unpaid ? 'danger' : 'neutral'}
              tone={tone as 'teal' | 'primary' | 'success' | 'danger'}
              icon={(
                <ServiceIcon
                  name={'receipt'}
                />
              )}
            />
          );
        })}
      </div>
      <section
        className={styles['income-summary']}
        aria-label={'월별 실제 입금 합계'}
      >
        <h2>
          실제 입금 합계
        </h2>
        <p>
          {formatMonthRange(range)}
          {' '}
          동안 실제 받은 전체 동의 입금입니다. 일부납부·선입금을 포함하며, 아래 세대 검색·동 필터와 관계없이 표시합니다.
        </p>
        <div
          className={styles['income-kpis']}
        >
          {[
            {
              label: multipleMonths ? '기간 세대 입금액' : '당월 세대 입금액',
              value: income.household,
              tone: 'success' as const
            },
            {
              label: multipleMonths ? '기간 기타 입금액' : '당월 기타 입금액',
              value: income.other,
              tone: 'neutral' as const
            },
            {
              label: multipleMonths ? '기간 전체 입금액' : '당월 전체 입금액',
              value: income.total,
              tone: 'primary' as const
            }
          ].map((item) => (
            <SummaryCard
              key={item.label}
              density={'compact'}
              label={item.label}
              value={formatInteger(item.value)}
              unit={'원'}
              tone={item.tone}
              icon={(
                <ServiceIcon
                  name={'coins'}
                />
              )}
            />
          ))}
        </div>
        <p>
          {`기타 입금 ${income.otherCount}건 · 전체 입금액 = 세대 입금액 + 기타 입금액`}
        </p>
      </section>
      <div
        className={styles.workspace}
      >
        <section
          className={styles.panel}
          aria-label={'세대별 미수금 내역'}
        >
          <FilterTabs
            label={'수납 상태'}
            scrollable
            items={['전체', '미납', '일부납부', '선입금', '납부완료'].map((value) => ({
              value,
              label: value,
              count: filterMonthlyPreviewRows(matches, {
                ...filters,
                status: value
              }).length
            }))}
            value={status}
            onChange={(value) => {
              onFiltersChange({
                ...filters,
                status: value
              });
              setPage(1);
            }}
          />
          <div
            className={styles.filters}
          >
            <MonthRangePicker
              label={'조회 기간'}
              referenceMonth={ledger.asOf.slice(0, 7)}
              labelHidden
              value={range}
              onChange={(value) => {
                setSelected(null);
                onRangeChange(value);
                setPage(1);
              }}
            />
            <Input
              aria-label={'수납 현황 세대 검색'}
              placeholder={'이름, 동·호수로 검색하세요'}
              leadingIcon={(
                <ServiceIcon
                  name={'search'}
                />
              )}
              value={query}
              onChange={(event) => {
                onFiltersChange({
                  ...filters,
                  query: event.target.value
                });
                setPage(1);
              }}
            />
            <Dropdown
              aria-label={'수납 현황 동 필터'}
              value={building}
              options={[
                {
                  value: '',
                  label: '전체 동'
                },
                ...getPreviewBuildingOptions(ledger)
              ]}
              onChange={(value) => {
                onFiltersChange({
                  ...filters,
                  building: value
                });setSelected(null);setPage(1);
              }}
            />
            <Dropdown
              aria-label={'수납 현황 표시 개수'}
              required
              value={String(pageSize)}
              options={[10, 20, 50].map((size) => ({
                value: String(size),
                label: `${size}개씩 보기`
              }))}
              onChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            />
          </div>
          <div
            className={styles['edit-heading']}
          >
            <span
              role={selecting ? 'status' : undefined}
            >
              {selecting ? `${checkedIds.size}${multipleMonths ? '건' : '세대'} 선택` : `총 ${filtered.length}${multipleMonths ? '건 (세대·월)' : '세대'}`}
            </span>
            <div
              className={styles['table-actions']}
            >
              <MonthlyExportButton
                month={range.endMonth}
                range={range}
                filters={filters}
                selectedRowKeys={selectedRowKeys}
              />
              <Button
                variant={'text'}
                size={'sm'}
                aria-pressed={selecting}
                disabled={!filtered.length && !selecting}
                onClick={onToggleSelection}
              >
                {selecting ? '완료' : '편집'}
              </Button>
            </div>
          </div>
          <DataTable
            label={'세대별 월별 수납 현황'}
            rows={visible}
            getRowKey={getMonthlyRowKey}
            onRowClick={(row) => selecting ? toggleSelection(getMonthlyRowKey(row)) : openDetail(row.unitId, row.month)}
            minWidth={status === '선입금' ? 720 : 1100}
            emptyState={(
              <StateMessage
                variant={Boolean(query.trim() || building || status !== '전체' || range.startMonth !== ledger.asOf.slice(0, 7) || range.endMonth !== ledger.asOf.slice(0, 7)) ? 'no-results' : 'empty-data'}
                layout={'inline'}
                title={'조건에 맞는 세대가 없습니다.'}
              />
            )}
            columns={visibleColumns}
          />
          <div
            className={styles.pagination}
          >
            <Pagination
              label={'월별 수납 현황 페이지'}
              unit={multipleMonths ? '건' : '세대'}
              total={filtered.length}
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
          <p
            className={styles.footer}
          >
            {multipleMonths && '각 행은 해당 월의 수납 현황입니다. 잔액은 월별로 합산하지 않으며 요약은 시작 월 이월액·종료 월 미수금을 표시합니다. 편집에서는 월별 행을 개별 선택합니다. '}
            선입금 탭은 조회월 말에 잔액이 남은 세대이며, 당월 부과가 없는 세대와 기존 인계 선납도 포함합니다. 미수금은 양수 청구의 충당액으로 계산하며 0원·음수 부과는 정산 확인 대상입니다.
          </p>
        </section>

      </div>
      {selected && (
        <MonthlyDetail
          month={selected.month}
          unitId={selected.unitId}
          onClose={() => {
            setSelected(null);
            if (!searchParams.has('unit')) return;
            const query = new URLSearchParams(searchParams.toString());
            query.delete('unit');
            router.replace(`${pathname}${query.size ? `?${query}` : ''}`, {
              scroll: false
            });
          }}
        />
      )}
    </div>
  );
}
