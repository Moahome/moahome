import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import {
  getBasicInfoErrors,
  type BasicInfo
} from '../model/basicInfo';

/** 기본 정보만 검증하며 관리대상 생성이나 최종 등록 API는 호출하지 않습니다. */
export async function validateBasicInfo(basicInfo: BasicInfo): Promise<BasicInfo> {
  const result = await authenticatedAPI<BasicInfo>({
    url: '/api/property-registrations/basic-info/validate',
    method: 'POST',
    data: basicInfo,
  });

  // 200 응답이어도 계약에 맞는 기본 정보가 없으면 검증 성공으로 표시하지 않습니다.
  if (!result || typeof result.name !== 'string' || typeof result.address !== 'string'
    || !(result.addressDetail === null || typeof result.addressDetail === 'string')
    || !(result.propertyType === null || typeof result.propertyType === 'string')
    || typeof result.hasBuildings !== 'boolean'
    || Object.keys(getBasicInfoErrors({
      ...result,
      addressDetail: result.addressDetail ?? '',
      propertyType: result.propertyType ?? '',
    })).length > 0) {
    throw new ApiError(200, 'INVALID_RESPONSE', '검증 결과를 확인할 수 없습니다.');
  }

  return {
    name: result.name,
    address: result.address,
    addressDetail: result.addressDetail,
    propertyType: result.propertyType,
    hasBuildings: result.hasBuildings,
  };
}
