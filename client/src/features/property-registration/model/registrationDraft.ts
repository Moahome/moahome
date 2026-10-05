import {
  EMPTY_AUTOMATIC_UNIT_RULE,
  type AutomaticUnitRule
} from './automaticUnits';
import {
  EMPTY_BASIC_INFO,
  getBasicInfoErrors,
  type BasicInfoDraft
} from './basicInfo';
import {
  normalizeBuildingName,
  type BuildingDraft,
  type UnitDraft
} from './unitSetup';
import { UNIT_STATUS_OPTIONS } from '@/entities/property';

const DRAFT_STORAGE_KEY = 'moahome.property-registration.basic-info';

export type RegistrationStep = 'basic' | 'units';

export interface RegistrationDraft {
  basicInfo: BasicInfoDraft;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  automaticUnitRule: AutomaticUnitRule;
  step: RegistrationStep;
  basicInfoValidated: boolean;
}

/** 새 등록에는 예시 세대를 넣지 않고 기본 입력과 빈 동·세대 목록을 만듭니다. */
function createEmptyDraft(): RegistrationDraft {
  return {
    basicInfo: {
      ...EMPTY_BASIC_INFO
    },
    buildings: [],
    units: [],
    automaticUnitRule: {
      ...EMPTY_AUTOMATIC_UNIT_RULE
    },
    step: 'basic',
    basicInfoValidated: false,
  };
}

/** 브라우저 저장소의 세대도 타입과 ID를 확인하되 수정 중인 동 참조 불일치는 화면에서 해결합니다. */
function isUnitDraft(value: unknown): value is UnitDraft {
  if (!value || typeof value !== 'object') return false;

  const unit = value as UnitDraft;

  return typeof unit.clientId === 'string' && Boolean(unit.clientId)
    && (unit.buildingClientId === null || typeof unit.buildingClientId === 'string')
    && typeof unit.unitNumber === 'string'
    && (unit.displayName === null || typeof unit.displayName === 'string')
    && (unit.floor === null || (Number.isInteger(unit.floor) && unit.floor >= -32768 && unit.floor <= 32767))
    && (unit.status === 'INACTIVE' || UNIT_STATUS_OPTIONS.some((option) => option.value === unit.status));
}

/** 같은 사용자·탭의 새로고침에서만 단계와 입력을 복원하며 다른 계정·깨진 초안은 폐기합니다. */
export function restoreRegistrationDraft(userId: string): RegistrationDraft {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const stored = sessionStorage.getItem(DRAFT_STORAGE_KEY);

    if (navigation?.type !== 'reload' || !stored) {
      discardRegistrationDraft();
      return createEmptyDraft();
    }

    const data = JSON.parse(stored);
    const basicInfo = data?.basicInfo;
    const buildings = data?.buildings ?? [];
    const units = data?.units ?? [];
    const automaticUnitRule = data?.automaticUnitRule;
    // 이전 초안과 손상된 생성 규칙도 동·세대 입력은 유지하고 규칙만 기본값으로 복원합니다.
    const restoredRule: AutomaticUnitRule = automaticUnitRule
      && ['startFloor', 'endFloor', 'unitsPerFloor'].every((field) => typeof automaticUnitRule[field] === 'string')
      ? {
        startFloor: automaticUnitRule.startFloor,
        endFloor: automaticUnitRule.endFloor,
        unitsPerFloor: automaticUnitRule.unitsPerFloor,
      }
      : {
        ...EMPTY_AUTOMATIC_UNIT_RULE
      };

    if (data?.userId !== userId || !basicInfo
      || !['name', 'address', 'addressDetail', 'propertyType'].every((field) => typeof basicInfo[field] === 'string')
      || !(basicInfo.hasBuildings === null || typeof basicInfo.hasBuildings === 'boolean')
      || !Array.isArray(buildings) || !buildings.every((building) => building && typeof building.clientId === 'string'
        && /^[A-Za-z0-9_-]{1,50}$/.test(building.clientId) && typeof building.name === 'string')
      || !Array.isArray(units) || !units.every(isUnitDraft)
      || new Set(buildings.map((building) => building.clientId)).size !== buildings.length
      || new Set(units.map((unit) => unit.clientId)).size !== units.length) {
      discardRegistrationDraft();
      return createEmptyDraft();
    }

    const basicInfoValidated = data.basicInfoValidated === true && Object.keys(getBasicInfoErrors(basicInfo)).length === 0;

    return {
      basicInfo: {
        name: basicInfo.name,
        address: basicInfo.address,
        addressDetail: basicInfo.addressDetail,
        propertyType: basicInfo.propertyType,
        hasBuildings: basicInfo.hasBuildings,
      },
      buildings: buildings.map((building: BuildingDraft) => ({
        clientId: building.clientId,
        name: normalizeBuildingName(building.name)
      })),
      units: units.map((unit: UnitDraft) => ({
        clientId: unit.clientId,
        buildingClientId: unit.buildingClientId,
        unitNumber: unit.unitNumber,
        displayName: unit.displayName,
        floor: unit.floor,
        status: unit.status,
      })),
      automaticUnitRule: restoredRule,
      step: data.step === 'units' && basicInfoValidated ? 'units' : 'basic',
      basicInfoValidated,
    };
  } catch {
    discardRegistrationDraft();
    return createEmptyDraft();
  }
}

/** 등록 중 기본 정보와 동·세대만 보관하며 저장소가 차단되어도 현재 화면 입력은 유지합니다. */
export function saveRegistrationDraft(userId: string, draft: RegistrationDraft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      userId,
      ...draft
    }));
  } catch {
    // 토큰과 최종 제출 정보를 넣지 않으며 저장 차단은 등록 입력을 막지 않습니다.
  }
}

/** 단계 사이 이동에는 유지하고 등록 취소·흐름 밖 이탈·로그아웃에만 초안을 폐기합니다. */
export function discardRegistrationDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 저장소 접근이 차단되어도 등록 흐름 종료를 계속합니다.
  }
}
