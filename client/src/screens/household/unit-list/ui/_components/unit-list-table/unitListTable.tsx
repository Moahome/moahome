import { StateMessage } from '@/shared/ui/state-message';
import {
  getUnitLabel,
  getUnitSignupLabel,
  UNIT_STATUS_OPTIONS,
  type BuildingDraft,
  type UnitDraft,
  type UnitResidentSummary
} from '@/entities/property';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import styles from './unitListTable.module.css';

/** 행과 호수 버튼으로 세대 상세를 열고 가입 현황은 대표 주민 바로 옆에 표시합니다. */
export function UnitListTable({
  units,
  residentSummaries,
  buildings,
  hasBuildings,
  hasFilters,
  onOpenDetail,
}: {
  units: UnitDraft[];
  residentSummaries: Record<string, UnitResidentSummary> | null;
  buildings: BuildingDraft[];
  hasBuildings: boolean;
  hasFilters: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const buildingNames = new Map(buildings.map((building) => [building.clientId, building.name]));
  const numberLabel = (unit: UnitDraft) => getUnitLabel({
    ...unit,
    displayName: null
  });
  const identity = (unit: UnitDraft) => `${hasBuildings ? `${buildingNames.get(unit.buildingClientId ?? '') ?? '—'} ` : ''}${numberLabel(unit)}`;
  const columns: DataTableColumn<UnitDraft>[] = [];
  if (hasBuildings) columns.push({
    key: 'building',
    header: '동',
    render: (unit) => buildingNames.get(unit.buildingClientId ?? '') ?? '—'
  });
  columns.push(
    {
      key: 'number',
      header: '호수',
      rowHeader: true,
      render: (unit) => (
        <>
          <button
            type={'button'}
            className={styles['detail-button']}
            aria-label={`${identity(unit)} 상세 보기`}
            onClick={() => onOpenDetail(unit.clientId)}
          >
            {numberLabel(unit)}
          </button>
          {unit.displayName && (
            <span
              className={styles.alias}
            >
              {unit.displayName}
            </span>
          )}
        </>
      )
    },
    {
      key: 'status',
      header: '상태',
      render: (unit) => (
        <span
          className={styles.badge}
          data-status={unit.status}
        >
          {UNIT_STATUS_OPTIONS.find((option) => option.value === unit.status)?.label ?? '비활성'}
        </span>
      )
    },
    {
      key: 'representative',
      header: '대표 주민',
      render: (unit) => (
        <span
          className={!residentSummaries ? styles.unavailable : undefined}
        >
          {residentSummaries?.[unit.clientId]?.representativeName ?? '—'}
        </span>
      )
    },
    {
      key: 'membership',
      header: '가입 현황',
      render: (unit) => {
        const summary = residentSummaries?.[unit.clientId];
        if (!summary) return (
          <span
            className={styles.unavailable}
          >
            —
          </span>
        );

        return getUnitSignupLabel(summary);
      }
    },

  );

  return (
    <DataTable
      label={'세대 목록'}
      rows={units}
      columns={columns}
      getRowKey={(unit) => unit.clientId}
      minWidth={640}
      onRowClick={(unit) => onOpenDetail(unit.clientId)}
      emptyState={(
        <StateMessage
          variant={hasFilters ? 'no-results' : 'empty-data'}
          layout={'inline'}
          title={hasFilters ? '검색 결과가 없어요.' : '아직 등록된 세대가 없어요.'}
          description={hasFilters ? '검색어나 선택한 조건을 변경해주세요.' : '세대 추가를 눌러 관리할 세대를 등록해주세요.'}
        />
      )}
    />
  );
}
