'use client';

import { BANKING_PAGE_SIZES } from '../../../../constant/bankingOptions';

import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { type ReactNode } from 'react';
import styles from './balanceCommon.module.css';
import { usePagedTable } from './_hooks/useBalanceCommon';
import { StateMessage } from '@/shared/ui/state-message';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { Dropdown } from '@/shared/ui/form-controls';
import { Pagination } from '@/shared/ui/pagination';
import { useOpeningBalanceAction } from './_hooks/useBalanceCommon';
import { type CSSProperties } from 'react';

/** 같은 내용을 PC 모달과 모바일 독립 페이지에서 재사용하며 페이지의 복귀는 공통 헤더가 담당합니다. */
export function DetailDialog({
  title,
  children,
  onClose,
  busy = false,
  compact = false,
  footer,
  presentation = 'modal',
  className
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    busy?: boolean;
    compact?: boolean;
    footer?: ReactNode;
    presentation?: 'modal' | 'page';
    className?: string;
}) {
  if (presentation === 'page')
    return (
      <section
        className={[styles.page, className].filter(Boolean).join(' ')}
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
      className={[styles.modal, className].filter(Boolean).join(' ')}
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

/** 표마다 동일한 표시 개수·페이지 간격을 사용하고 다운로드 범위는 호출자가 전체 결과로 유지합니다. */
export function PagedTable<Row extends {
    id: string;
}>({
  label,
  rows,
  columns,
  toolbar,
  onRowClick,
  hasFilters = false
}: {
    label: string;
    hasFilters?: boolean;
    rows: readonly Row[];
    columns: DataTableColumn<Row>[];
    toolbar?: ReactNode;
    onRowClick?: (row: Row) => void;
}) {
  const {
    setPage, size, count, current, changeSize
  } = usePagedTable(rows.length);

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
          onChange={changeSize}
          options={BANKING_PAGE_SIZES.map((v) => ({
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
        emptyState={(
          <StateMessage
            variant={hasFilters ? 'no-results' : 'empty-data'}
            layout={'inline'}
            title={hasFilters ? '조건에 맞는 검색 결과가 없어요.' : '조회할 내역이 없습니다.'}
          />
        )}
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

/** 조회 동작과 도움말 터치를 분리하고 마우스·키보드·터치에서 같은 설명을 제공합니다. */
export function OpeningBalanceAction({
  missing,
  onOpen
}: { missing: boolean;
onOpen: () => void }) {
  const state = useOpeningBalanceAction({
    missing,
    onOpen
  });

  const {
    root,
    open,
    setOpen,
    label,
    tooltipWidth
  } = state;

  return (
    <div
      ref={root}
      className={styles['opening-action']}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement))
          setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
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
        onClick={() => {
          setOpen(false);
          onOpen();
        }}
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