'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MonthPicker } from '@/shared/ui/month-picker';
import { MonthlyDetail } from '../monthly-detail/monthlyDetail';
import {
  MONTHLY_STATUS_TONES,
  PaymentBadge
} from '../payment-badge/paymentBadge';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { Pagination } from '@/shared/ui/pagination';
import { Toast } from '@/shared/ui/toast';
import { SummaryCard } from '@/shared/ui/summary-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  getMonthlyPreviewRows,
  getMonthlyPreviewIncome,
  getPreviewBuildingOptions,
  filterMonthlyPreviewRows,
  type MonthlyCollectionFilters
} from '../../../model/paymentPreview';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import { createMonthlyWorkbook } from '../../../model/monthlyExport';
import styles from './monthlyCollection.module.css';

/** 다운로드 행동을 페이지 헤더에서 제공하고 원장·필터 UI의 배치를 바꾸지 않습니다. */
export function MonthlyExportButton({ month, filters }: { month: string; filters: MonthlyCollectionFilters }) {
  const { ledger } = usePaymentWorkspace();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  /** 페이지에 관계없이 현재 조회월·상태·검색·동 조건의 전체 결과를 공통 보고서 서식으로 저장합니다. */
  async function download() {
    setExporting(true);
    setError('');
    try {
      const blob = await createMonthlyWorkbook(ledger, month, filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `모아홈_수납현황_${month}_${filters.status}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('엑셀 파일을 만들지 못했어요. 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Button
        variant={'outline'}
        tone={'excel'}
        loading={exporting}
        onClick={download}
        leadingIcon={(
          <ServiceIcon
            name={'excel'}
          />
        )}
      >
        엑셀 다운로드
      </Button>
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </>
  );
}

/** 월별 실제 입금 합계와 청구의 이월·충당·미수를 함께 표시하되 두 기준의 금액을 섞지 않습니다. */
export function MonthlyCollection({ propertyId, month, onMonthChange, detailPath, filters, onFiltersChange }: {
  propertyId: string;
  month: string;
  onMonthChange: (month: string) => void;
  detailPath?: string;
  filters: MonthlyCollectionFilters;
  onFiltersChange: (filters: MonthlyCollectionFilters) => void;
}) {
  const router = useRouter();
  const { ledger } = usePaymentWorkspace();
  const { query, status, building } = filters;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = getMonthlyPreviewRows(ledger, month);
  const income = getMonthlyPreviewIncome(ledger, month);
  // 탭별 인원은 상태 필터를 적용하기 전의 검색·동 범위에서 세대마다 한 번만 셉니다.
  const matches = filterMonthlyPreviewRows(rows, {
    ...filters,
    status: '전체'
  });
  const filtered = filterMonthlyPreviewRows(matches, filters);
  // 필터·수납 결과로 세대 수가 줄어들면 빈 페이지 대신 마지막 유효 페이지를 표시합니다.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance') => rows.reduce((total, row) => total + row[key] + (key === 'billed' ? row.settlementAmount ?? BigInt(0) : BigInt(0)), BigInt(0));

  /** PC에서는 중앙 모달로, 모바일에서는 독립된 세대별 수납 상세 주소로 이동합니다. */
  function openDetail(unitId: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`${detailPath ?? `/manage/${propertyId}/payments/monthly`}/${month}/${encodeURIComponent(unitId)}`);
      return;
    }
    setSelected(unitId);
  }

  return (
    <div
      className={styles.monthly}
    >
      <div
        className={styles.kpis}
      >
        {[
          ['전월 이월 미수금', 'carry', 'warning'],
          ['당월 관리비 발생액', 'billed', 'primary'],
          ['당월 수납 반영액', 'applied', 'success'],
          ['당월 말 미수금', 'balance', 'danger']
        ].map(([label, key, tone]) => (
          <SummaryCard
            density={'compact'}
            key={key}
            label={label}
            value={key === 'balance' && rows.some((row) => row.settlementPending) ? '정산 확인 필요' : formatInteger(sum(key as 'carry' | 'billed' | 'applied' | 'balance'))}
            unit={key === 'balance' && rows.some((row) => row.settlementPending) ? '' : '원'}
            tone={tone as 'warning' | 'primary' | 'success' | 'danger'}
            icon={(
              <ServiceIcon
                name={'receipt'}
              />
            )}
          />
        ))}
      </div>
      <section
        className={styles['income-summary']}
        aria-label={'월별 실제 입금 합계'}
      >
        <h2>
          실제 입금 합계
        </h2>
        <p>
          {month.replace('-', '년 ')}
          월에 실제 받은 전체 동의 입금입니다. 일부납부·선입금을 포함하며, 아래 세대 검색·동 필터와 관계없이 표시합니다.
        </p>
        <div
          className={styles['income-kpis']}
        >
          {[
            {
              label: '당월 세대 입금액',
              value: income.household,
              tone: 'success' as const
            },
            {
              label: '당월 기타 입금액',
              value: income.other,
              tone: 'neutral' as const
            },
            {
              label: '당월 전체 입금액',
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
            items={['전체', '미납', '일부납부', '납부완료'].map((value) => ({
              value,
              label: value,
              count: value === '전체' ? matches.length : matches.filter((row) => row.status === value).length
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
            <MonthPicker
              label={'조회 월'}
              labelHidden
              value={month}
              onChange={(value) => {
                setSelected(null);
                onMonthChange(value);
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
          <DataTable
            label={'세대별 월별 수납 현황'}
            rows={visible}
            getRowKey={(row) => row.unitId}
            onRowClick={(row) => openDetail(row.unitId)}
            minWidth={1100}
            emptyState={'조건에 맞는 세대가 없습니다.'}
            columns={[
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
                key: 'payer',
                header: '최근 입금자',
                render: (row) => row.latestPayer
              },
              {
                key: 'carry',
                header: '전월 이월액',
                align: 'right',
                render: (row) => formatWon(row.carry)
              },
              {
                key: 'billed',
                header: '당월 발생액',
                align: 'right',
                render: (row) => formatWon(row.billed + (row.settlementAmount ?? BigInt(0)))
              },
              {
                key: 'applied',
                header: '당월 수납 반영액',
                align: 'right',
                render: (row) => formatWon(row.applied)
              },
              {
                key: 'balance',
                header: '미수금 잔액',
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

            ]}
          />
          <div
            className={styles.pagination}
          >
            <Pagination
              label={'월별 수납 현황 페이지'}
              unit={'세대'}
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
            미수금은 양수 청구의 충당액으로 계산하며 선입금은 별도로 표시합니다. 0원·음수 부과는 정산 확인 대상입니다.
          </p>
        </section>

      </div>
      {selected && (
        <MonthlyDetail
          month={month}
          unitId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
