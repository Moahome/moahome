import type { ResidentRow } from '../api/residentApiTypes';

/** 소속이 없는 명부는 대시로 표시하고 같은 세대 문구를 표와 검색에서 함께 사용합니다. */
export function getResidentUnitLabel(row: ResidentRow, buildings: ReadonlyMap<string, string>, hasBuildings: boolean) {
  if (!row.unitNumber) return '—';
  const number = /호$/.test(row.unitNumber) ? row.unitNumber : `${row.unitNumber}호`;
  if (!hasBuildings) return number;

  return `${buildings.get(row.buildingId ?? '') ?? '—'} ${number}`;
}
