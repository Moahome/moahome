import type { UnitDraft } from '../model/unitFormTypes';

/** 원문은 유지하고 표시할 때만 숫자 동과 호수 사이의 공백을 한 칸으로 맞춥니다. */
export function formatBuildingUnitText(text: string) {
  return text.replace(/([0-9]+동)\s*(?=B?[0-9]+호)/gi, '$1 ');
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
