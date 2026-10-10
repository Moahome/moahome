import {
  getBuildingNameError,
  getUnitFormErrors,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '@/entities/property';

export {
  getBuildingNameError,
  normalizeBuildingName,
  getUnitFormErrors,
  normalizeUnitForm,
  getUnitLabel,
  getFloorLabel,
  type BuildingDraft,
  type UnitDraft,
  type UnitForm,
  type UnitFormErrors,
  type UnitStatus
} from '@/entities/property';

/** 다음 단계 전에 최소 세대 수와 모든 동 참조를 검사하며 구분 변경으로 기존 입력을 지우지 않습니다. */
export function getUnitSetupError(hasBuildings: boolean, buildings: BuildingDraft[], units: UnitDraft[]) {
  if (!hasBuildings && (buildings.length || units.some((unit) => unit.buildingClientId !== null))) {
    return '동 구분이 변경되었어요. 기존 동 연결을 해제해주세요.';
  }
  if (hasBuildings && !buildings.length) return '관리할 동을 하나 이상 추가해주세요.';
  if (hasBuildings && buildings.some((building) => getBuildingNameError(building.name, buildings, building.clientId))) {
    return '등록한 동 이름을 확인해주세요.';
  }
  if (!units.length) return '관리할 세대를 하나 이상 추가해주세요.';

  for (const unit of units) {
    const errors = getUnitFormErrors({
      buildingClientId: unit.buildingClientId ?? '',
      unitNumber: unit.unitNumber,
      displayName: unit.displayName ?? '',
      floor: unit.floor === null ? '' : String(unit.floor),
      status: unit.status,
    }, hasBuildings, buildings, units, unit.clientId);

    if (Object.keys(errors).length) return `${getUnitLabel(unit)}의 동과 세대 정보를 확인해주세요.`;
  }

  return null;
}
