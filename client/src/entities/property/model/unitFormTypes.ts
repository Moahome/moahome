import type { UNIT_STATUS_OPTIONS } from '../constants/propertyOptions';

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
