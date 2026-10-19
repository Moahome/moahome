import {
  UNIT_STATUS_OPTIONS,
  getSortedBuildings,
  type BuildingDraft
} from '@/entities/property';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { EMPTY_UNIT_LIST_FILTERS } from '../../../model/unitList';
import type { UnitListFilters as Filters } from '../../../model/unitListTypes';
import styles from './unitListFilters.module.css';

export function UnitListFilters({
  hasBuildings,
  buildings,
  hasInactive,
  filters,
  hasFilters,
  onChange,
}: {
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  hasInactive: boolean;
  filters: Filters;
  hasFilters: boolean;
  onChange: (filters: Filters) => void;
}) {
  const showBuildingFilter = hasBuildings && buildings.length > 0;
  const statusOptions = [
    {
      value: 'ALL',
      label: '전체 상태'
    }, ...UNIT_STATUS_OPTIONS,
    ...(hasInactive ? [{
      value: 'INACTIVE',
      label: '비활성'
    }] : [])
  ];

  return (
    <div
      className={styles.filters}
      data-has-buildings={showBuildingFilter}
    >
      <Input
        aria-label={'세대 검색'}
        placeholder={hasBuildings ? '동·호수·세대 별칭 검색' : '호수·세대 별칭 검색'}
        value={filters.query}
        onChange={(event) => onChange({
          ...filters,
          query: event.target.value
        })}
        leadingIcon={(
          <ServiceIcon
            name={'search'}
          />
        )}
      />
      {showBuildingFilter && (
        <Dropdown
          aria-label={'동 필터'}
          clearable={false}
          value={filters.buildingId || 'ALL'}
          options={[{
            value: 'ALL',
            label: '전체 동'
          }, ...getSortedBuildings(buildings).map((building) => ({
            value: building.clientId,
            label: building.name
          }))]}
          onChange={(value) => onChange({
            ...filters,
            buildingId: value === 'ALL' ? '' : value
          })}
        />
      )}
      <Dropdown
        aria-label={'상태 필터'}
        clearable={false}
        value={filters.status || 'ALL'}
        options={statusOptions}
        onChange={(value) => onChange({
          ...filters,
          status: value === 'ALL' ? '' : value
        })}
      />
      <Button
        variant={'outline'}
        disabled={!hasFilters}
        onClick={() => onChange(EMPTY_UNIT_LIST_FILTERS)}
        leadingIcon={(
          <ServiceIcon
            name={'reset'}
          />
        )}
      >
        초기화
      </Button>
    </div>
  );
}
