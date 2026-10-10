import type {
  BuildingDraft,
  UnitDraft
} from './unitForm';

const NAME_COLLATOR = new Intl.Collator('ko', {
  numeric: true
});

/** 초안의 배열과 식별자를 유지하고 화면에 표시할 동만 숫자를 인식하는 이름순으로 정렬합니다. */
export function getSortedBuildings(buildings: BuildingDraft[]) {
  return [...buildings].sort((left, right) => NAME_COLLATOR.compare(left.name, right.name));
}

/** 동 이름을 먼저 비교하고 같은 동의 세대는 표시 이름 대신 원본 호수의 숫자 순서로 표시합니다. */
export function getSortedUnits(units: UnitDraft[], buildings: BuildingDraft[], hasBuildings: boolean) {
  const buildingNames = new Map(buildings.map((building) => [building.clientId, building.name]));

  return [...units].sort((left, right) => {
    const buildingOrder = hasBuildings
      ? NAME_COLLATOR.compare(buildingNames.get(left.buildingClientId ?? '') ?? '', buildingNames.get(right.buildingClientId ?? '') ?? '')
      : 0;

    return buildingOrder || NAME_COLLATOR.compare(left.unitNumber, right.unitNumber);
  });
}
