'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import { Pagination } from '@/shared/ui/pagination';
import { Toast } from '@/shared/ui/toast';
import { useUnitList } from './_hooks/useUnitList';
import { UnitListHeader } from './_components/unit-list-header/unitListHeader';
import { UnitListSummary } from './_components/unit-list-summary/unitListSummary';
import { UnitListFilters } from './_components/unit-list-filters/unitListFilters';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { ListCard } from '@/shared/ui/list-card';
import { UnitListTable } from './_components/unit-list-table/unitListTable';
import { UnitListDialogs } from './_components/unit-list-dialogs/unitListDialogs';
import styles from './unitListPage.module.css';

/** 세대 목록의 조회 상태와 화면 블록만 조합하고 각 블록의 표시·스타일은 해당 컴포넌트가 담당합니다. */
export function UnitListPage({
  propertyId,
  saved,
}: {
  propertyId: string;
  saved?: string;
}) {
  const controller = useUnitList(propertyId, saved);
  const { list, data, view } = controller;

  if (list.isPending) return (
    <section
      className={styles.state}
    >
      <LoadingState
        title={'세대 목록을 불러오고 있어요.'}
      />
    </section>
  );

  if (list.isError) return (
    <RequestError
      error={list.error}
      onRetry={() => void list.refetch({
        cancelRefetch: false
      })}
    />
  );

  return (
    <section
      className={styles.page}
      aria-labelledby={'unit-list-title'}
    >
      <UnitListHeader
        titleRef={controller.listTitleRef}
        hasBuildings={data.hasBuildings}
        canAdd={!data.hasBuildings || data.buildings.length > 0}
        onManageBuildings={controller.openBuildings}
        onAutomaticAdd={controller.openAutomatic}
        onAdd={() => controller.openEditor(null)}
      />
      <UnitListSummary
        units={data.units}
      />
      <ListCard>
        <UnitListFilters
          hasBuildings={data.hasBuildings}
          buildings={data.buildings}
          hasInactive={data.units.some((unit) => unit.status === 'INACTIVE')}
          filters={controller.filters}
          hasFilters={view.hasFilters}
          onChange={controller.changeFilters}
        />
        <ListToolbar
          unit={'세대'}
          sizeLabel={'페이지당 세대 수'}
          total={view.filtered.length}
          pageSize={controller.pageSize}
          onSizeChange={controller.changePageSize}
        />
        <UnitListTable
          units={view.visibleUnits}
          residentSummaries={data.residentSummaries}
          buildings={data.buildings}
          hasBuildings={data.hasBuildings}
          hasFilters={view.hasFilters}
          onOpenDetail={controller.openDetail}
        />
        <Pagination
          label={'세대 목록 페이지'}
          unit={'세대'}
          total={view.filtered.length}
          page={view.currentPage}
          pageCount={view.pageCount}
          pageSize={controller.pageSize}
          onPageChange={controller.changePage}
        />
      </ListCard>
      <UnitListDialogs
        controller={controller}
      />
      {controller.notice && (
        <Toast
          key={controller.notice.id}
          message={controller.notice.message}
          onClose={controller.clearNotice}
        />
      )}
    </section>
  );
}
