export interface BasicInfoDraft {
  name: string;
  address: string;
  addressDetail: string;
  propertyType: string;
  hasBuildings: boolean | null;
}

export interface BasicInfo extends Omit<BasicInfoDraft, 'addressDetail' | 'propertyType' | 'hasBuildings'> {
  addressDetail: string | null;
  propertyType: string | null;
  hasBuildings: boolean;
}

export type BasicInfoErrors = Partial<Record<keyof BasicInfoDraft, string>>;

export const EMPTY_BASIC_INFO: BasicInfoDraft = {
  name: '',
  address: '',
  addressDetail: '',
  propertyType: '',
  hasBuildings: null,
};

/** Server 계약과 동일하게 앞뒤 공백을 제외한 Unicode 코드 포인트 수를 계산합니다. */
export function getTextLength(value: string) {
  return Array.from(value.trim()).length;
}

/** 필수 입력과 선택 입력의 길이를 검증하며 동 없음(false)도 명시적인 선택으로 인정합니다. */
export function getBasicInfoErrors(draft: BasicInfoDraft): BasicInfoErrors {
  const errors: BasicInfoErrors = {};
  const nameLength = getTextLength(draft.name);
  const addressLength = getTextLength(draft.address);

  if (nameLength === 0) errors.name = '건물·단지 이름을 입력해주세요.';
  if (nameLength > 50) errors.name = '건물·단지 이름은 50자 이내로 입력해주세요.';
  if (addressLength === 0) errors.address = '주소를 검색해주세요.';
  if (addressLength > 255) errors.address = '주소는 255자 이내로 선택해주세요.';
  if (getTextLength(draft.addressDetail) > 255) errors.addressDetail = '상세주소는 255자 이내로 입력해주세요.';
  if (getTextLength(draft.propertyType) > 30) errors.propertyType = '건물 유형은 30자 이내로 선택해주세요.';
  if (draft.hasBuildings === null) errors.hasBuildings = '동 구분을 선택해주세요.';

  return errors;
}

/** 선택 입력의 빈 값을 null로 정리하되 필수 동 선택을 기본값으로 대체하지 않습니다. */
export function normalizeBasicInfo(draft: BasicInfoDraft): BasicInfo {
  if (Object.keys(getBasicInfoErrors(draft)).length > 0 || draft.hasBuildings === null) {
    throw new Error('기본 정보를 확인해주세요.');
  }

  return {
    name: draft.name.trim(),
    address: draft.address.trim(),
    addressDetail: draft.addressDetail.trim() || null,
    propertyType: draft.propertyType.trim() || null,
    hasBuildings: draft.hasBuildings,
  };
}
