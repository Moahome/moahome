'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { Pagination } from '@/shared/ui/pagination';
import { StateMessage } from '@/shared/ui/state-message';
import { getConfirmedUnitReceipts } from '../../model/paymentPreview';
import { PaymentBadge } from '../_components/payment-badge/paymentBadge';
import { usePaymentWorkspace } from '../payment-workspace-provider/paymentWorkspaceProvider';
import styles from './monthlyReceiptsPage.module.css';

/** 세대의 확정 입금을 최신순으로 조회하며 연도·표시 개수는 조회 결과만 제한하고 수납 계산은 변경하지 않습니다. */
export function MonthlyReceiptsPage({ month, unitId, listPath }: {
  month: string;
  unitId: string;
  listPath: string;
}) {
  const router = useRouter();
  const { ledger } = usePaymentWorkspace();
  const [year, setYear] = useState('ALL');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const unit = ledger.units.find((item) => item.id === unitId);
  const receipts = getConfirmedUnitReceipts(ledger, unitId, month);
  const years = [...new Set(receipts.map((payment) => payment.date.slice(0, 4)))].sort().reverse();
  const filtered = receipts.filter((payment) => year === 'ALL' || payment.date.startsWith(`${year}-`));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** PC는 조회월·세대를 주소에 보존해 목록의 상세 모달을 복원하고 모바일은 기존 상세 페이지로 복귀합니다. */
  function returnToDetail() {
    const href = window.matchMedia('(max-width: 767px)').matches
      ? `${listPath}/${month}/${encodeURIComponent(unitId)}`
      : `${listPath}?month=${month}&unit=${encodeURIComponent(unitId)}`;
    router.push(href);
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'monthly-receipts-title'}
    >
      <ListHeader
        className={styles.header}
        menu={'통장 관리'}
        title={'전체 입금 내역'}
        titleId={'monthly-receipts-title'}
        description={unit ? `${unit.label} · ${month} 말 기준` : '세대 없음'}
        actions={(
          <Button
            className={styles['desktop-back']}
            variant={'outline'}
            onClick={returnToDetail}
          >
            목록
          </Button>
        )}
      />
      {unit ? (
        <div
          className={styles.card}
        >
          <div
            className={styles['list-heading']}
          >
            <h2>
              {`입금 기록 ${filtered.length}건`}
            </h2>
            <span>
              최신 입금순
            </span>
          </div>
          <div
            className={styles.filters}
          >
            <Dropdown
              aria-label={'입금 연도'}
              value={year}
              options={[
                {
                  value: 'ALL',
                  label: '전체 연도'
                },
                ...years.map((value) => ({
                  value,
                  label: `${value}년`
                }))
              ]}
              onChange={(value) => { setYear(value); setPage(1); }}
            />
            <Dropdown
              aria-label={'입금 내역 표시 개수'}
              value={String(pageSize)}
              options={[10, 20, 50].map((value) => ({
                value: String(value),
                label: `${value}개씩 보기`
              }))}
              onChange={(value) => { setPageSize(Number(value)); setPage(1); }}
            />
          </div>
          <DataTable
            label={'전체 입금 내역'}
            rows={visible}
            getRowKey={(payment) => payment.id}
            minWidth={520}
            emptyState={(
              <StateMessage
                variant={year === 'ALL' ? 'empty-data' : 'no-results'}
                layout={'inline'}
                title={year === 'ALL' ? '확정된 입금 내역이 없습니다.' : '선택한 연도의 입금 내역이 없습니다.'}
              />
            )}
            columns={[
              {
                key: 'date',
                header: '입금일',
                render: (payment) => payment.date
              },
              {
                key: 'payer',
                header: '입금자',
                render: (payment) => payment.payer
              },
              {
                key: 'amount',
                header: '입금액',
                align: 'right',
                render: (payment) => formatWon(payment.amount)
              },
              {
                key: 'status',
                header: '상태',
                align: 'center',
                render: () => (
                  <PaymentBadge
                    tone={'success'}
                  >
                    확정
                  </PaymentBadge>
                )
              }
            ]}
          />
          <Pagination
            label={'전체 입금 내역 페이지'}
            unit={'건'}
            total={filtered.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <StateMessage
          variant={'empty-data'}
          title={'세대를 찾을 수 없습니다.'}
        />
      )}
    </section>
  );
}
