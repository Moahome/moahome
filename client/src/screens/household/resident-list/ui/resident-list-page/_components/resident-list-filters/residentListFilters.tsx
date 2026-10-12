import { getSortedBuildings } from '@/entities/property';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS
} from '@/entities/resident';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { ResidentList } from '../../../../api/residentApi';
import {
  EMPTY_RESIDENT_FILTERS,
  type ResidentFilters
} from '../../../../model/residentList';
import styles from './residentListFilters.module.css';

/** 전체 주민 명부를 검색하며 동 없는 대상에서는 동 필터를 숨깁니다. 연락처는 노출된 끝 네 자리로만 검색합니다. */
export function ResidentListFilters({
  hasBuildings,
  buildings,
  filters,
  hasFilters,
  onChange,
}: {
  hasBuildings: boolean;
  buildings: ResidentList['buildings'];
  filters: ResidentFilters;
  hasFilters: boolean;
  onChange: (filters: ResidentFilters) => void;
}) {
  const showBuildingFilter = hasBuildings && buildings.length > 0;

  return (
    <div
      className={styles.filters}
      data-has-buildings={showBuildingFilter}
    >
      <Input
        aria-label={'주민 검색'}
        placeholder={hasBuildings ? '이름·연락처 끝 4자리·동·호수 검색' : '이름·연락처 끝 4자리·호수 검색'}
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
            value: building.id,
            label: building.name
          }))]}
          onChange={(value) => onChange({
            ...filters,
            buildingId: value === 'ALL' ? '' : value
          })}
        />
      )}
      <Dropdown
        aria-label={'주민 구분 필터'}
        clearable={false}
        value={filters.relationType || 'ALL'}
        options={[{
          value: 'ALL',
          label: '전체 주민 구분'
        }, ...RESIDENT_RELATION_OPTIONS]}
        onChange={(value) => onChange({
          ...filters,
          relationType: value === 'ALL' ? '' : value
        })}
      />
      <Dropdown
        aria-label={'가입 상태 필터'}
        clearable={false}
        value={filters.signupStatus || 'ALL'}
        options={[
          {
            value: 'ALL',
            label: '전체 가입 상태'
          },
          ...RESIDENT_SIGNUP_OPTIONS
        ]}
        onChange={(value) => onChange({
          ...filters,
          signupStatus: value === 'ALL' ? '' : value
        })}
      />
      <Button
        variant={'outline'}
        disabled={!hasFilters}
        onClick={() => onChange(EMPTY_RESIDENT_FILTERS)}
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
