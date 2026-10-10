import { ApiError } from '@/shared/api';
import type {
  ResidentList,
  ResidentRow
} from '../api/residentApi';

export interface ResidentFilters {
  query: string;
  buildingId: string;
  relationType: string;
  signupStatus: string;
}

export const EMPTY_RESIDENT_FILTERS: ResidentFilters = {
  query: '',
  buildingId: '',
  relationType: '',
  signupStatus: ''
};

/** 소속이 없는 명부는 대시로 표시하고 같은 세대 문구를 표와 검색에서 함께 사용합니다. */
export function getResidentUnitLabel(row: ResidentRow, buildings: ReadonlyMap<string, string>, hasBuildings: boolean) {
  if (!row.unitNumber) return '—';
  const number = /호$/.test(row.unitNumber) ? row.unitNumber : `${row.unitNumber}호`;
  if (!hasBuildings) return number;

  return `${buildings.get(row.buildingId ?? '') ?? '—'} ${number}`;
}

/** 주민을 한 행으로 검색·필터링하고 결과가 줄어들어도 유효한 페이지로 표시합니다. */
export function getResidentListView(data: ResidentList, filters: ResidentFilters, page: number, pageSize: number) {
  const buildings = new Map(data.buildings.map((building) => [building.id, building.name]));
  const search = filters.query.trim().toLocaleLowerCase();
  const filtered = data.residents.filter((row) => (!filters.buildingId || row.buildingId === filters.buildingId)
    && (!filters.relationType || row.relationType === filters.relationType)
    && (!filters.signupStatus || row.signupStatus === filters.signupStatus)
    && `${row.name} ${row.phoneLast4 ?? ''} ${getResidentUnitLabel(row, buildings, data.hasBuildings)}`.toLocaleLowerCase().includes(search));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));

  return {
    filtered,
    rows: filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    pageCount,
    hasFilters: Boolean(filters.query || filters.buildingId || filters.relationType || filters.signupStatus)
  };
}

/** 실패 원문에 개인정보나 내부 SQL이 섞이지 않도록 상태별 고정 안내를 사용합니다. */
export function getResidentListError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
  if (error instanceof ApiError && error.status === 403) return '주민 목록을 조회할 관리소장 권한이 없어요.';

  return '주민 목록을 불러오지 못했어요. 다시 시도해주세요.';
}
