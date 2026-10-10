'use client';

import { Button } from '@/shared/ui/button';
import { Pagination } from '@/shared/ui/pagination';
import { getResidentListError } from '../../model/residentList';
import { useResidentList } from './_hooks/useResidentList';
import { ResidentListSummary } from './_components/resident-list-summary/residentListSummary';
import { ResidentListFilters } from './_components/resident-list-filters/residentListFilters';
import { ResidentListTable } from './_components/resident-list-table/residentListTable';
import { ResidentListToolbar } from './_components/resident-list-toolbar/residentListToolbar';
import styles from './residentListPage.module.css';

/** 주민 목록의 조회 상태와 공통 UI를 조합하며 등록·상세·수정 동작은 이번 화면에 추가하지 않습니다. */
export function ResidentListPage({
  propertyId,
}: {
  propertyId: string;
}) {
  const controller = useResidentList(propertyId);
  const { list, data, view } = controller;

  return (
    <section
      className={styles.page}
      aria-labelledby={'resident-list-title'}
    >
      <header
        className={styles.header}
      >
        <p>
          세대 관리
        </p>
        <h1
          id={'resident-list-title'}
        >
          주민 목록
        </h1>
        <p>
          등록된 주민을 조회하고 소속 세대와 대표 여부를 확인하세요.
        </p>
      </header>
      {list.isPending && (
        <div
          className={styles.state}
          role={'status'}
        >
          주민 목록을 불러오고 있어요.
        </div>
      )}
      {list.isError && (
        <div
          className={styles.state}
          role={'alert'}
        >
          <p>
            {getResidentListError(list.error)}
          </p>
          <Button
            variant={'outline'}
            onClick={() => void list.refetch()}
          >
            다시 시도
          </Button>
        </div>
      )}
      {list.isSuccess && (
        <>
          <ResidentListSummary
            residents={data.residents}
          />
          <div
            className={styles.card}
          >
            <ResidentListFilters
              hasBuildings={data.hasBuildings}
              buildings={data.buildings}
              filters={controller.filters}
              hasFilters={view.hasFilters}
              onChange={controller.changeFilters}
            />
            <ResidentListToolbar
              total={view.filtered.length}
              pageSize={controller.pageSize}
              onSizeChange={controller.changePageSize}
            />
            <ResidentListTable
              residents={view.rows}
              buildings={data.buildings}
              hasBuildings={data.hasBuildings}
              hasFilters={view.hasFilters}
            />
            <Pagination
              label={'주민 목록 페이지'}
              unit={'명'}
              total={view.filtered.length}
              page={view.currentPage}
              pageCount={view.pageCount}
              pageSize={controller.pageSize}
              onPageChange={controller.changePage}
            />
          </div>
        </>
      )}
    </section>
  );
}
