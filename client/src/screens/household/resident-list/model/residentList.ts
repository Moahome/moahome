import { getSortedUnits } from '@/entities/property';
import { ApiError } from '@/shared/api';
import type { ResidentList } from '../api/residentApiTypes';
import { getResidentUnitLabel } from '../lib/residentLabel';
import type { ResidentFilters } from './residentListTypes';

export const EMPTY_RESIDENT_FILTERS: ResidentFilters = {
  query: '',
  buildingId: '',
  relationType: '',
  signupStatus: ''
};

const NAME_COLLATOR = new Intl.Collator('ko', {
  numeric: true
});

/** 동·호수를 숫자 순으로 정렬한 뒤 페이지를 나누며 같은 세대는 이름·ID 순, 소속 없는 주민은 마지막에 표시합니다. */
export function getResidentListView(data: ResidentList, filters: ResidentFilters, page: number, pageSize: number) {
  const buildings = new Map(data.buildings.map((building) => [building.id, building.name]));
  const search = filters.query.trim().toLocaleLowerCase();
  const filtered = data.residents.filter((row) => (!filters.buildingId || row.buildingId === filters.buildingId)
    && (!filters.relationType || row.relationType === filters.relationType)
    && (!filters.signupStatus || row.signupStatus === filters.signupStatus)
    && `${row.name} ${row.phoneLast4 ?? ''} ${getResidentUnitLabel(row, buildings, data.hasBuildings)}`.toLocaleLowerCase().includes(search));
  const byName = [...filtered].sort((left, right) => NAME_COLLATOR.compare(left.name, right.name) || left.id.localeCompare(right.id));
  const sorted = [
    ...getSortedUnits(byName.filter((row) => row.unitNumber !== null).map((row) => ({
      ...row,
      buildingClientId: row.buildingId,
      unitNumber: row.unitNumber ?? ''
    })), data.buildings.map((building) => ({
      clientId: building.id,
      name: building.name
    })), data.hasBuildings),
    ...byName.filter((row) => row.unitNumber === null)
  ];
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));

  return {
    filtered: sorted,
    rows: sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    pageCount,
    hasFilters: Boolean(filters.query || filters.buildingId || filters.relationType || filters.signupStatus)
  };
}

/** 실패 원문에 개인정보나 내부 SQL이 섞이지 않도록 상태별 고정 안내를 사용합니다. */
export function getResidentListError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
  if (error instanceof ApiError && error.status === 403) return '이 관리대상의 주민 목록 조회 권한이 없어요.';

  return '주민 목록을 불러오지 못했어요. 다시 시도해주세요.';
}
