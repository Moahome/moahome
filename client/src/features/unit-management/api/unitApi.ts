import {
  isPropertyId,
  type BuildingDraft,
  type UnitDraft,
  type UnitResidentSummary
} from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

interface UnitResponse {
  id: string;
  buildingId: string | null;
  unitNumber: string;
  displayName: string | null;
  floor: number | null;
  status: UnitDraft['status'];
}

export interface UnitList {
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  residentSummaries: Record<string, UnitResidentSummary> | null;
}

/** 권한 없음(null)과 실제 0명을 구분하고 불완전한 집계 응답을 임의의 숫자로 표시하지 않습니다. */
function readResidentSummaries(value: unknown, units: UnitDraft[]): Record<string, UnitResidentSummary> | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 주민 정보를 확인할 수 없습니다.');
  }
  const summaries = value as Record<string, UnitResidentSummary>;
  if (Object.keys(summaries).length !== units.length || units.some((unit) => {
    const summary = summaries[unit.clientId];
    return !summary || !(summary.representativeName === null || (typeof summary.representativeName === 'string' && Boolean(summary.representativeName.trim())))
      || [summary.total, summary.approved, summary.pending, summary.notJoined].some((count) => !Number.isSafeInteger(count) || count < 0)
      || summary.total !== summary.approved + summary.pending + summary.notJoined
      || (summary.total === 0 && summary.representativeName !== null);
  })) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 주민 정보를 확인할 수 없습니다.');
  }

  return summaries;
}

/** 응답의 세대 식별자와 입력 자료형을 확인하고 기존 편집기가 사용하는 형식으로 변환합니다. */
function readUnit(unit: UnitResponse): UnitDraft {
  if (!unit || !isPropertyId(unit.id)
    || !(unit.buildingId === null || isPropertyId(unit.buildingId))
    || typeof unit.unitNumber !== 'string' || !unit.unitNumber.trim()
    || !(unit.displayName === null || typeof unit.displayName === 'string')
    || !(unit.floor === null || (Number.isInteger(unit.floor) && unit.floor >= -32768 && unit.floor <= 32767))
    || !['ACTIVE', 'VACANT', 'INACTIVE'].includes(unit.status)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 정보를 확인할 수 없습니다.');
  }

  return {
    clientId: unit.id,
    buildingClientId: unit.buildingId,
    unitNumber: unit.unitNumber,
    displayName: unit.displayName,
    floor: unit.floor,
    status: unit.status
  };
}

/** 현재 관리대상의 저장된 목록을 조회하고 다른 대상의 응답은 표시하지 않습니다. */
export async function getUnits(propertyId: string): Promise<UnitList> {
  const result = await authenticatedAPI<{
    propertyId: string;
    hasBuildings: boolean;
    buildings: { id: string; name: string }[];
    units: UnitResponse[];
    residentSummaries: unknown;
  }>({
    url: `/api/properties/${propertyId}/units`
  });

  if (!result || result.propertyId !== propertyId || typeof result.hasBuildings !== 'boolean'
    || !Array.isArray(result.buildings) || !Array.isArray(result.units)
    || result.buildings.some((building) => !building || !isPropertyId(building.id) || typeof building.name !== 'string' || !building.name.trim())) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 목록을 확인할 수 없습니다.');
  }

  const units = result.units.map(readUnit);

  return {
    hasBuildings: result.hasBuildings,
    buildings: result.buildings.map((building) => ({
      clientId: building.id,
      name: building.name
    })),
    units,
    residentSummaries: readResidentSummaries(result.residentSummaries, units)
  };
}

/** 편집기의 임시 ID는 신규 저장 요청에 보내지 않고 수정에는 기존 DB 식별자만 사용합니다. */
export async function saveUnit(propertyId: string, unit: UnitDraft, editingId: string | null): Promise<UnitDraft> {
  const result = await authenticatedAPI<UnitResponse>({
    url: `/api/properties/${propertyId}/units${editingId ? `/${editingId}` : ''}`,
    method: editingId ? 'PUT' : 'POST',
    data: {
      buildingId: unit.buildingClientId,
      unitNumber: unit.unitNumber,
      displayName: unit.displayName,
      floor: unit.floor,
      status: unit.status
    }
  });

  return readUnit(result);
}

/** 동 이름은 서버에서 다시 검증하며 기존 동 수정에는 DB ID를 URL로 전달합니다. */
export async function saveBuilding(propertyId: string, building: BuildingDraft, editingId: string | null): Promise<void> {
  const result = await authenticatedAPI<{ id: string; name: string }>({
    url: `/api/properties/${propertyId}/buildings${editingId ? `/${editingId}` : ''}`,
    method: editingId ? 'PUT' : 'POST',
    data: {
      name: building.name
    }
  });
  if (!result || !isPropertyId(result.id) || typeof result.name !== 'string' || !result.name.trim()) {
    throw new ApiError(200, 'INVALID_RESPONSE', '동 정보를 확인할 수 없습니다.');
  }
}

/** 자동 입력 결과는 개별 요청으로 나누지 않고 한 번에 저장하여 실패 시 부분 추가를 방지합니다. */
export async function saveUnits(propertyId: string, units: UnitDraft[]): Promise<void> {
  const result = await authenticatedAPI<UnitResponse[]>({
    url: `/api/properties/${propertyId}/units/batch`,
    method: 'POST',
    data: {
      units: units.map((unit) => ({
        buildingId: unit.buildingClientId,
        unitNumber: unit.unitNumber,
        displayName: unit.displayName,
        floor: unit.floor,
        status: unit.status
      }))
    }
  });
  if (!Array.isArray(result) || result.length !== units.length) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 정보를 확인할 수 없습니다.');
  }
  result.forEach(readUnit);
}

/** 개별·선택 삭제 모두 DB 식별자로 요청하고 성공한 뒤 호출자가 서버 목록을 다시 조회합니다. */
export async function deleteUnits(propertyId: string, unitIds: string[]): Promise<void> {
  const isSingle = unitIds.length === 1;
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/units${isSingle ? `/${unitIds[0]}` : ''}`,
    method: 'DELETE',
    ...(isSingle ? {} : {
      data: {
        unitIds
      }
    })
  });
}

/** 동과 연결 세대의 삭제는 서버의 한 트랜잭션에서 처리합니다. */
export async function deleteBuilding(propertyId: string, buildingId: string): Promise<void> {
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/buildings/${buildingId}`,
    method: 'DELETE'
  });
}
