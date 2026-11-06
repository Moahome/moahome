import type { ManualReceiptUnit } from '../model/manualReceiptTypes';

/** 세대 표시는 동·호수로 유지하고 대표·가족 이름과 구분 기호 없는 동호수까지 검색합니다. */
export function getReceiptUnitSearchOptions(units: readonly ManualReceiptUnit[]) {
  return units.map((unit) => ({
    value: unit.id,
    label: unit.label,
    searchKeywords: [
      ...(unit.residentNames ?? []),
      unit.representativeName ?? '',
      unit.label.replace(/[동호\s]/g, ''),
      unit.label.replace(/동\s*/, '-').replace(/호$/, '')
    ]
  }));
}
