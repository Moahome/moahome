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
  getPreviewBuildingOptions
} from '../../../model/paymentPreview';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';
import styles from './monthlyCollection.module.css';

/** 다운로드 행동을 페이지 헤더에서 제공하고 원장·필터 UI의 배치를 바꾸지 않습니다. */
export function MonthlyExportButton({ month }: { month: string }) {
  const { ledger } = usePaymentWorkspace();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const rows = getMonthlyPreviewRows(ledger, month);
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance') => rows.reduce((total, row) => total + row[key] + (key === 'billed' ? row.settlementAmount ?? BigInt(0) : BigInt(0)), BigInt(0));
  /** 현재 선택월 전체 세대를 문자열 셀로 내보내 큰 금액의 정밀도와 텍스트 안전성을 보존합니다. */
  async function download() {
    setExporting(true);
    setError('');
    try {
      const { default: writeExcelFile } = await import('write-excel-file/universal');
      const values = [
        ['세대', '세대 대표', '최근 입금자', '전월 이월액', '당월 발생액', '당월 수납 반영액', '미수금 잔액', '선입금 잔액', '상태'],
        ...rows.map((row) => [row.unitLabel, row.representativeName, row.latestPayer, String(row.carry), String(row.billed + (row.settlementAmount ?? BigInt(0))), String(row.applied), !row.settlementPending ? String(row.balance) : '정산 확인 필요', String(row.prepaid), row.status]),
        ['합계', '', '', String(sum('carry')), String(sum('billed')), String(sum('applied')), rows.some((row) => row.settlementPending) ? '정산 확인 필요' : String(sum('balance')), String(rows.reduce((sum, row) => sum + row.prepaid, BigInt(0))), '']
      ];
      const blob = await writeExcelFile(values.map((row) => row.map((value) => ({
        value,
        type: String
      }))), {
        sheet: '월별 수납 현황',
        columns: [18, 18, 18, 22, 22, 22, 22, 22, 16].map((width) => ({
          width
        }))
      }).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `모아홈_수납현황_${month}.xlsx`;
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

/** 입금 총액 대신 청구에 반영한 금액으로 월별 이월·발생·충당·미수를 연결합니다. */
export function MonthlyCollection({ propertyId, month, onMonthChange }: { propertyId: string; month: string; onMonthChange: (month: string) => void }) {
  const router = useRouter();
  const { ledger } = usePaymentWorkspace();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('전체');
  const [building, setBuilding] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = getMonthlyPreviewRows(ledger, month);
  // 탭별 인원은 상태 필터를 적용하기 전의 검색·동 범위에서 세대마다 한 번만 셉니다.
  const matches = rows.filter((row) => (!building || row.buildingName === building)
    && `${row.unitLabel} ${row.representativeName} ${row.latestPayer}`.includes(query.trim()));
  const filtered = matches.filter((row) => status === '전체' || row.status === status);
  // 필터·수납 결과로 세대 수가 줄어들면 빈 페이지 대신 마지막 유효 페이지를 표시합니다.
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sum = (key: 'carry' | 'billed' | 'applied' | 'balance') => rows.reduce((total, row) => total + row[key] + (key === 'billed' ? row.settlementAmount ?? BigInt(0) : BigInt(0)), BigInt(0));

  /** PC에서는 중앙 모달로, 모바일에서는 독립된 세대별 수납 상세 주소로 이동합니다. */
  function openDetail(unitId: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/payments/monthly/${month}/${encodeURIComponent(unitId)}`);
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
              setStatus(value);
              setPage(1);
            }}
          />
          <div
            className={styles.filters}
          >
            <MonthPicker
              label={'조회 월'}
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
                setQuery(event.target.value);
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
                setBuilding(value);setSelected(null);setPage(1);
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
            minWidth={900}
            emptyState={'조건에 맞는 세대가 없습니다.'}
            columns={[
              {
                key: 'unit',
                header: '세대',
                rowHeader: true,
                render: (row) => row.unitLabel
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
