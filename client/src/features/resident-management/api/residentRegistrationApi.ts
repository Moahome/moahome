import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  RegistrationOptions,
  ResidentRegistrationInput,
  ResidentRegistrationResponse
} from './residentRegistrationApiTypes';

/** 기존 세대 조회 API를 사용하고 등록에 필요한 식별자·동·호수만 선택지로 사용합니다. */
export async function getRegistrationOptions(propertyId: string): Promise<RegistrationOptions> {
  const result = await authenticatedAPI<RegistrationOptions>({
    url: `/api/properties/${propertyId}/units`
  });
  if (!result || result.propertyId !== propertyId || typeof result.hasBuildings !== 'boolean'
    || !Array.isArray(result.buildings) || !Array.isArray(result.units)
    || result.buildings.some((item) => !item || !isPropertyId(item.id) || typeof item.name !== 'string' || !item.name.trim())
    || result.units.some((item) => !item || !isPropertyId(item.id) || !(item.buildingId === null || isPropertyId(item.buildingId))
      || typeof item.unitNumber !== 'string' || !item.unitNumber.trim() || !['ACTIVE', 'VACANT', 'INACTIVE'].includes(item.status)
      || (result.hasBuildings ? !result.buildings.some((building) => building.id === item.buildingId) : item.buildingId !== null))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '세대 목록을 확인할 수 없습니다.');
  }

  return result;
}

/** 같은 폼의 재시도에는 같은 요청 ID를 보내고 등록 응답에 개인정보가 없어도 결과 소속을 검증합니다. */
export async function registerResident(propertyId: string, input: ResidentRegistrationInput): Promise<void> {
  const result = await authenticatedAPI<ResidentRegistrationResponse>({
    url: `/api/properties/${propertyId}/residents`,
    method: 'POST',
    data: input
  });
  // 재등록은 새 요청 ID와 다른 기존 주민 ID를 반환하므로 UUID 형식과 요청한 소속을 검증합니다.
  if (!result || !isPropertyId(result.id) || result.propertyId !== propertyId || result.unitId !== input.unitId
    || typeof result.representative !== 'boolean') {
    throw new ApiError(200, 'INVALID_RESPONSE', '등록 결과를 확인할 수 없습니다.');
  }
}
