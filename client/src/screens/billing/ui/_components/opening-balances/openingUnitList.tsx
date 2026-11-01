'use client';

import { useState } from 'react';
import type { OpeningWorkspace } from '@/features/billing-management';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { formatInteger } from '@/shared/lib/format';
import styles from './openingBalances.module.css';

/** 목록의 검색·필터는 표시에만 적용하고 저장할 전체 세대는 부모의 편집 상태에 유지합니다. */
export function OpeningUnitList({ units, busy, confirmed, onEdit, onUpload }: {
  units: OpeningWorkspace['units'];
  busy: boolean;
  confirmed: boolean;
  onEdit: (id: string) => void;
  onUpload: () => void;
}) {
  const [query, setQuery] = useState('');
  const [building, setBuilding] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const buildingOptions = [...new Map(units.filter((unit) => unit.buildingId).map((unit) => [unit.buildingId!, unit.buildingName ?? '이름 없는 동'])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'ko', {
      numeric: true
    }));
  // 검색·페이지는 표시만 제한합니다. 요약과 저장은 전체 세대·계좌 초안을 사용합니다.
  const filtered = units.filter((unit) => `${unit.label} ${unit.responsibility ?? ''}`.includes(query.trim())
    && (!building || unit.buildingId === building)
    && (status === 'all' || (status === 'receivable' && BigInt(unit.receivable) > BigInt(0))
      || (status === 'credit' && BigInt(unit.credit) > BigInt(0))
      || (status === 'empty' && BigInt(unit.receivable) === BigInt(0) && BigInt(unit.credit) === BigInt(0))))
    .sort((left, right) => left.label.localeCompare(right.label, 'ko', {
      numeric: true
    }));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  return (
    <ListCard>
      <div
        className={styles['section-heading']}
      >
        <h2>
          세대별 기존 잔액
        </h2>
        {!confirmed && (
          <div
            className={styles['excel-tools']}
          >
            <Button
              variant={'outline'}
              tone={'excel'}
              disabled={busy}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
              aria-label={'엑셀 업로드'}
              onClick={onUpload}
            >
              엑셀 업로드
            </Button>
          </div>
        )}
      </div>
      <div
        className={styles.filters}
      >
        <Input
          aria-label={'기존 잔액 세대 검색'}
          placeholder={'동 / 호수 / 메모 검색'}
          leadingIcon={(
            <ServiceIcon
              name={'search'}
            />
          )}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
        />
        <Dropdown
          aria-label={'기존 잔액 동 필터'}
          value={building}
          options={[{
            value: '',
            label: '동 전체'
          }, ...buildingOptions.map(([value, label]) => ({
            value,
            label
          }))]}
          onChange={(value) => { setBuilding(value); setPage(1); }}
        />
        <Dropdown
          aria-label={'기존 잔액 상태 필터'}
          value={status}
          options={[{
            value: 'all',
            label: '상태 전체'
          }, {
            value: 'receivable',
            label: '미납 있음'
          }, {
            value: 'credit',
            label: '선납 있음'
          }, {
            value: 'empty',
            label: '없음'
          }]}
          onChange={(value) => { setStatus(value); setPage(1); }}
        />
        <Dropdown
          aria-label={'기존 잔액 표시 개수'}
          value={String(pageSize)}
          options={[10, 20, 50].map((size) => ({
            value: String(size),
            label: `${size}개씩 보기`
          }))}
          onChange={(value) => { setPageSize(Number(value)); setPage(1); }}
        />
      </div>
      <DataTable
        label={'세대별 기존 잔액'}
        rows={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        getRowKey={(unit) => unit.unitId}
        minWidth={1000}
        emptyState={units.length ? '조건에 맞는 세대가 없어요.' : '등록된 세대가 없어요.'}
        columns={[
          {
            key: 'unit',
            header: '세대',
            rowHeader: true,
            render: (unit) => unit.label
          },
          {
            key: 'receivable',
            header: '기존 미납',
            align: 'right',
            render: (unit) => `${formatInteger(BigInt(unit.receivable))}원`
          },
          {
            key: 'credit',
            header: '기존 선납',
            align: 'right',
            render: (unit) => `${formatInteger(BigInt(unit.credit))}원`
          },
          {
            key: 'origin',
            header: '발생월',
            render: (unit) => unit.originMonth || '—'
          },
          {
            key: 'note',
            header: '메모',
            render: (unit) => (
              <span
                className={styles.memo}
              >
                {unit.responsibility || '—'}
              </span>
            )
          },
          {
            key: 'status',
            header: '상태',
            render: (unit) => (
              <span
                className={styles.badges}
              >
                {BigInt(unit.receivable) > BigInt(0) && (
                  <span
                    className={styles.badge}
                    data-tone={'danger'}
                  >
                    미납 있음
                  </span>
                )}
                {BigInt(unit.credit) > BigInt(0) && (
                  <span
                    className={styles.badge}
                    data-tone={'teal'}
                  >
                    선납 있음
                  </span>
                )}
                {BigInt(unit.receivable) === BigInt(0) && BigInt(unit.credit) === BigInt(0) && (
                  <span
                    className={styles.badge}
                  >
                    없음
                  </span>
                )}
              </span>
            )
          },
          {
            key: 'action',
            header: '작업',
            align: 'right',
            render: (unit) => (
              <Button
                size={'sm'}
                variant={'outline'}
                disabled={busy}
                aria-label={`${unit.label} 인계 정정`}
                onClick={() => onEdit(unit.unitId)}
                leadingIcon={(
                  <ServiceIcon
                    name={'pen'}
                  />
                )}
              >
                인계 정정
              </Button>
            )
          }
        ]}
      />
      <div
        className={styles['list-pagination']}
      >
        <Pagination
          label={'기존 잔액 페이지'}
          unit={'세대'}
          total={filtered.length}
          page={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

    </ListCard>
  );
}
