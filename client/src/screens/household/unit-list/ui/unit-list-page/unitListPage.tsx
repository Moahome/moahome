'use client';

import { Button } from '@/shared/ui/button';
import { Toast } from '@/shared/ui/toast';
import { getUnitListError } from '../../model/unitList';
import { useUnitList } from './_hooks/useUnitList';
import { UnitListHeader } from './_components/unit-list-header/unitListHeader';
import { UnitListSummary } from './_components/unit-list-summary/unitListSummary';
import { UnitListFilters } from './_components/unit-list-filters/unitListFilters';
import { UnitListToolbar } from './_components/unit-list-toolbar/unitListToolbar';
import { UnitListTable } from './_components/unit-list-table/unitListTable';
import { UnitListPagination } from './_components/unit-list-pagination/unitListPagination';
import { UnitListDialogs } from './_components/unit-list-dialogs/unitListDialogs';
import styles from './unitListPage.module.css';

/** 세대 목록의 조회 상태와 화면 블록만 조합하고 각 블록의 표시·스타일은 해당 컴포넌트가 담당합니다. */
export function UnitListPage({
  propertyId,
}: {
  propertyId: string;
}) {
  const controller = useUnitList(propertyId);
  const { list, data, view } = controller;

  if (list.isPending) return (
    <section
      className={styles.state}
      role={'status'}
    >
      세대 목록을 불러오고 있어요.
    </section>
  );
  if (list.isError) return (
    <section
      className={styles.state}
      role={'alert'}
    >
      <h1>
        세대 목록을 불러오지 못했어요.
      </h1>
      <p>
        {getUnitListError(list.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => void list.refetch()}
      >
        다시 시도
      </Button>
    </section>
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
      <div
        className={styles.card}
      >
        <UnitListFilters
          hasBuildings={data.hasBuildings}
          buildings={data.buildings}
          hasInactive={data.units.some((unit) => unit.status === 'INACTIVE')}
          filters={controller.filters}
          hasFilters={view.hasFilters}
          onChange={controller.changeFilters}
        />
        <UnitListToolbar
          total={view.filtered.length}
          pageSize={controller.pageSize}
          onSizeChange={controller.changePageSize}
        />
        <UnitListTable
          units={view.visibleUnits}
          buildings={data.buildings}
          hasBuildings={data.hasBuildings}
          hasFilters={view.hasFilters}
          onOpenDetail={controller.openDetail}
        />
        <UnitListPagination
          total={view.filtered.length}
          page={view.currentPage}
          pageCount={view.pageCount}
          pageSize={controller.pageSize}
          onPageChange={controller.changePage}
        />
      </div>
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
