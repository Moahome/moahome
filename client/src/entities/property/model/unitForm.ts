import { UNIT_STATUS_OPTIONS } from '../constants/propertyOptions';
import { getTextLength } from '@/shared/lib/format';

export interface BuildingDraft {
  clientId: string;
  name: string;
}

// 이전 초안의 비활성 값을 버리지 않고 복원하되 새 등록 검증에는 허용하지 않습니다.
export type UnitStatus = typeof UNIT_STATUS_OPTIONS[number]['value'] | 'INACTIVE';

export interface UnitDraft {
  clientId: string;
  buildingClientId: string | null;
  unitNumber: string;
  displayName: string | null;
  floor: number | null;
  status: UnitStatus;
}

export interface UnitForm {
  buildingClientId: string;
  unitNumber: string;
  displayName: string;
  floor: string;
  status: UnitStatus;
}

export type UnitFormErrors = Partial<Record<keyof UnitForm, string>>;

/** 동 접미사를 한 번만 붙여 숫자·문자 이름 모두 같은 저장값과 중복 기준으로 사용합니다. */
export function normalizeBuildingName(name: string) {
  const normalizedName = name.trim();

  if (!normalizedName) return '';

  return normalizedName.endsWith('동') ? normalizedName : `${normalizedName}동`;
}

/** 동 이름은 공백 정리 후 길이와 현재 초안 안의 중복을 확인합니다. */
export function getBuildingNameError(name: string, buildings: BuildingDraft[], editingId?: string) {
  const normalizedName = normalizeBuildingName(name);

  if (!normalizedName) return '동 이름을 입력해주세요.';
  if (getTextLength(normalizedName) > 50) return '동 이름은 50자 이내로 입력해주세요.';
  if (buildings.some((entry) => entry.clientId !== editingId && normalizeBuildingName(entry.name) === normalizedName)) return '이미 등록한 동 이름이에요.';

  return null;
}

/** 등록 요청의 길이·정수 범위·동 참조와 같은 동 안의 세대번호 중복을 검증합니다. */
export function getUnitFormErrors(form: UnitForm, hasBuildings: boolean, buildings: BuildingDraft[], units: UnitDraft[], editingId?: string): UnitFormErrors {
  const errors: UnitFormErrors = {};
  const normalizedNumber = form.unitNumber.trim();
  const numberLength = getTextLength(normalizedNumber);
  const buildingClientId = hasBuildings ? form.buildingClientId : null;
  const floor = form.floor.trim();

  if (!numberLength) errors.unitNumber = '호수를 입력해주세요.';
  if (numberLength > 30) errors.unitNumber = '호수는 30자 이내로 입력해주세요.';
  if (getTextLength(form.displayName) > 50) errors.displayName = '세대 별칭은 50자 이내로 입력해주세요.';
  if (hasBuildings && !buildings.some((building) => building.clientId === buildingClientId)) {
    errors.buildingClientId = '세대가 속한 동을 선택해주세요.';
  }
  if (floor && (!Number.isInteger(Number(floor)) || Number(floor) < -32768 || Number(floor) > 32767)) {
    errors.floor = '층은 -32,768~32,767 사이의 정수로 입력해주세요.';
  }
  if (!UNIT_STATUS_OPTIONS.some((option) => option.value === form.status)) errors.status = '세대 상태를 선택해주세요.';
  if (units.some((unit) => unit.clientId !== editingId && unit.buildingClientId === buildingClientId && unit.unitNumber === form.unitNumber.trim())) {
    errors.unitNumber = hasBuildings ? '같은 동에 이미 등록한 호수예요.' : '이미 등록한 호수예요.';
  }

  return errors;
}

/** 배열 순서와 초안 식별자를 유지하고 선택 입력의 빈 값만 null로 정리합니다. */
export function normalizeUnitForm(form: UnitForm, hasBuildings: boolean, clientId: string): UnitDraft {
  return {
    clientId,
    buildingClientId: hasBuildings ? form.buildingClientId : null,
    unitNumber: form.unitNumber.trim(),
    displayName: form.displayName.trim() || null,
    floor: form.floor.trim() ? Number(form.floor) : null,
    status: form.status,
  };
}

/** 호수 원문과 표시 이름을 유지하고 숫자 호수와 B 접두사 지하 호수에 화면용 호 접미사를 붙입니다. */
export function getUnitLabel(unit: UnitDraft) {
  return unit.displayName || (/^(?:[0-9]+|B[1-9][0-9]{2,})$/.test(unit.unitNumber) ? `${unit.unitNumber}호` : unit.unitNumber);
}

/** 저장된 음수 층은 B 표기로 바꾸고 지상 층은 숫자로 표시합니다. */
export function getFloorLabel(floor: number) {
  const floorNumber = floor < 0 ? `B${Math.abs(floor)}` : String(floor);

  return `${floorNumber}층`;
}
