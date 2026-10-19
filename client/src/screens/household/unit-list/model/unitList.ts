import {
  getSortedUnits,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '@/entities/property';
import type { UnitListFilters } from './unitListTypes';

export const EMPTY_UNIT_LIST_FILTERS: UnitListFilters = {
  query: '',
  buildingId: '',
  status: ''
};

/** 현재 동 참조와 검색 조건으로 목록을 좁히고 삭제 후에도 유효한 페이지 범위를 계산합니다. */
export function getUnitListView(units: UnitDraft[], buildings: BuildingDraft[], hasBuildings: boolean, filters: UnitListFilters, page: number, pageSize: number) {
  const buildingId = buildings.some((building) => building.clientId === filters.buildingId) ? filters.buildingId : '';
  const buildingNames = new Map(buildings.map((building) => [building.clientId, building.name]));
  const search = filters.query.trim().toLocaleLowerCase();
  const filtered = getSortedUnits(units, buildings, hasBuildings).filter((unit) => (!buildingId || unit.buildingClientId === buildingId)
    && (!filters.status || unit.status === filters.status)
    && `${buildingNames.get(unit.buildingClientId ?? '') ?? ''} ${unit.unitNumber} ${getUnitLabel(unit)}`.toLocaleLowerCase().includes(search));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;

  return {
    filtered,
    visibleUnits: filtered.slice(firstIndex, firstIndex + pageSize),
    pageCount,
    currentPage,
    firstIndex,
    hasFilters: Boolean(filters.query || buildingId || filters.status)
  };
}
