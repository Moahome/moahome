import {
  getSortedUnits,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '@/entities/property';
import { ApiError } from '@/shared/api';

export interface UnitListFilters {
  query: string;
  buildingId: string;
  status: string;
}

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

/** 서버 오류 코드를 고정 안내로 바꾸며 내부 오류·개인정보 원문은 화면에 노출하지 않습니다. */
export function getUnitListError(error: unknown) {
  if (!(error instanceof ApiError)) return '정보를 처리하지 못했어요. 다시 시도해주세요.';
  if (error.code === 'DUPLICATE_BUILDING') return '이미 등록된 동 이름이에요. 동 이름을 확인해주세요.';
  if (error.code === 'DUPLICATE_UNIT') return '이미 등록된 호수가 포함되어 있어요. 목록을 다시 확인해주세요.';
  if (error.code === 'INVALID_REQUEST') return '동과 세대 정보를 확인해주세요.';
  if (error.code === 'UNIT_NOT_FOUND') return '대상을 찾을 수 없어요. 목록을 새로 확인해주세요.';
  if (error.code === 'UNIT_NOT_EDITABLE') return '현재 수정할 수 없는 세대예요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
  if (error.status === 403) return '세대를 관리할 권한이 없어요.';

  return '정보를 처리하지 못했어요. 다시 시도해주세요.';
}
