import { isPropertyId } from '@/entities/property';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS,
  type ResidentSignupStatus
} from '@/entities/resident';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export interface ResidentRow {
  id: string;
  name: string;
  phoneLast4: string | null;
  unitId: string | null;
  buildingId: string | null;
  unitNumber: string | null;
  relationType: string | null;
  representative: boolean;
  signupStatus: ResidentSignupStatus;
}

export interface ResidentList {
  propertyId: string;
  hasBuildings: boolean;
  buildings: { id: string; name: string }[];
  residents: ResidentRow[];
}

/** 전체 연락처 대신 끝 네 자리와 같은 관리대상의 현재 소속만 받아 명부의 자료형을 검증합니다. */
export async function getResidents(propertyId: string): Promise<ResidentList> {
  const result = await authenticatedAPI<ResidentList>({
    url: `/api/properties/${propertyId}/residents`
  });
  const invalid = () => new ApiError(200, 'INVALID_RESPONSE', '주민 목록을 확인할 수 없습니다.');
  if (!result || result.propertyId !== propertyId || typeof result.hasBuildings !== 'boolean'
    || !Array.isArray(result.buildings) || !Array.isArray(result.residents)) throw invalid();
  if (result.buildings.some((building) => !building || !isPropertyId(building.id)
    || typeof building.name !== 'string' || !building.name.trim())) throw invalid();
  const ids = new Set<string>();
  for (const row of result.residents) {
    if (!row || !isPropertyId(row.id) || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim()
      || !(row.phoneLast4 === null || (typeof row.phoneLast4 === 'string' && /^[0-9]{4}$/.test(row.phoneLast4)))
      || !(row.unitId === null || isPropertyId(row.unitId))
      || !(row.buildingId === null || isPropertyId(row.buildingId))
      || !(row.unitNumber === null || (typeof row.unitNumber === 'string' && Boolean(row.unitNumber.trim())))
      || !(row.relationType === null || RESIDENT_RELATION_OPTIONS.some((option) => option.value === row.relationType))
      || typeof row.representative !== 'boolean' || !RESIDENT_SIGNUP_OPTIONS.some((option) => option.value === row.signupStatus)) throw invalid();
    if (row.unitId === null && (row.buildingId !== null || row.unitNumber !== null || row.relationType !== null || row.representative)) throw invalid();
    if (row.unitId !== null && (row.unitNumber === null || row.relationType === null)) throw invalid();
    if (!result.hasBuildings && row.buildingId !== null) throw invalid();
    ids.add(row.id);
  }

  return result;
}
