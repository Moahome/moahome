import type {
  BuildingDraft,
  UnitDraft
} from './unitSetup';

export interface AutomaticUnitRule {
  startFloor: string;
  endFloor: string;
  unitsPerFloor: string;
}

export const EMPTY_AUTOMATIC_UNIT_RULE: AutomaticUnitRule = {
  startFloor: '',
  endFloor: '',
  unitsPerFloor: '',
};

const MAX_AUTOMATIC_UNITS = 1000;

type AutomaticUnitErrors = Partial<Record<keyof AutomaticUnitRule | 'buildingClientId', string>>;

/** 층은 저장 가능한 정수 범위, 두 자리 순번은 1~99로 제한하고 한 번의 미리보기 크기를 제한합니다. */
function getRuleErrors(rule: AutomaticUnitRule): AutomaticUnitErrors {
  const errors: AutomaticUnitErrors = {};

  for (const field of ['startFloor', 'endFloor'] as const) {
    const value = rule[field].trim();
    if (!value) {
      errors[field] = '층을 입력해주세요.';
      continue;
    }
    if (!/^-?[0-9]+$/.test(value) || Number(value) < -32768 || Number(value) > 32767) {
      errors[field] = '층은 -32,768~32,767 사이의 정수로 입력해주세요.';
    }
  }

  const count = rule.unitsPerFloor.trim();
  if (!/^[0-9]+$/.test(count) || Number(count) < 1 || Number(count) > 99) {
    errors.unitsPerFloor = '층당 세대 수는 1~99개로 입력해주세요.';
  }
  if (Object.keys(errors).length) return errors;
  if (Number(rule.startFloor) > Number(rule.endFloor)) {
    errors.endFloor = '마지막 층은 시작 층 이상이어야 합니다.';
    return errors;
  }
  const startFloor = Number(rule.startFloor);
  const endFloor = Number(rule.endFloor);
  // 지하에서 지상으로 이어지는 범위에도 0층은 없으므로 실제 생성 층수에서 제외합니다.
  const floorCount = endFloor - startFloor + 1 - (startFloor <= 0 && endFloor >= 0 ? 1 : 0);
  if (!floorCount) {
    errors.endFloor = '0층은 생성하지 않습니다. 지하 또는 지상 층을 포함해주세요.';
    return errors;
  }
  if (floorCount * Number(count) > MAX_AUTOMATIC_UNITS) {
    errors.endFloor = '한 번에 최대 1,000세대까지 자동 입력할 수 있어요. 층 범위를 나눠주세요.';
  }

  return errors;
}

/** 미리보기와 추가에서 같은 규칙을 사용하며 중복은 선택한 동의 원본 호수 문자열로만 검사합니다. */
export function getAutomaticUnitPreview(rule: AutomaticUnitRule, buildingClientId: string | null, hasBuildings: boolean, buildings: BuildingDraft[], units: UnitDraft[]) {
  const errors = getRuleErrors(rule);
  if (hasBuildings && !buildings.some((building) => building.clientId === buildingClientId)) {
    errors.buildingClientId = '세대를 추가할 동을 선택해주세요.';
  }

  const entries: Array<{
    unitNumber: string;
    floor: number;
    isDuplicate: boolean;
  }> = [];

  if (Object.keys(errors).length) return {
    errors,
    entries,
    duplicateCount: 0,
    newCount: 0
  };

  const existingNumbers = new Set(units.filter((unit) => unit.buildingClientId === buildingClientId).map((unit) => unit.unitNumber.trim()));
  for (let floor = Number(rule.startFloor); floor <= Number(rule.endFloor); floor += 1) {
    if (floor === 0) continue;

    // 층 값은 정수로 보존하고 지하 호수의 음수 기호만 B 접두사로 변환합니다.
    const floorNumber = floor < 0 ? `B${Math.abs(floor)}` : String(floor);
    for (let sequence = 1; sequence <= Number(rule.unitsPerFloor); sequence += 1) {
      const unitNumber = `${floorNumber}${String(sequence).padStart(2, '0')}`;
      entries.push({
        unitNumber,
        floor,
        isDuplicate: existingNumbers.has(unitNumber),
      });
    }
  }
  const duplicateCount = entries.filter((entry) => entry.isDuplicate).length;

  return {
    errors,
    entries,
    duplicateCount,
    newCount: entries.length - duplicateCount
  };
}

/** 확인 시점에 중복을 다시 검사하고 기존 ID·입력은 그대로 둔 채 새 세대만 서로 다른 초안 ID로 생성합니다. */
export function createAutomaticUnits(rule: AutomaticUnitRule, buildingClientId: string | null, hasBuildings: boolean, buildings: BuildingDraft[], units: UnitDraft[]): UnitDraft[] {
  const preview = getAutomaticUnitPreview(rule, buildingClientId, hasBuildings, buildings, units);

  if (Object.keys(preview.errors).length) return [];

  return preview.entries.filter((entry) => !entry.isDuplicate).map((entry) => ({
    clientId: crypto.randomUUID(),
    buildingClientId,
    unitNumber: entry.unitNumber,
    displayName: null,
    floor: entry.floor,
    status: 'ACTIVE',
  }));
}
