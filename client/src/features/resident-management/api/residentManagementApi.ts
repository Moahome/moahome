import { isPropertyId } from '@/entities/property';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS,
  type ResidentSignupStatus
} from '@/entities/resident';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export interface ResidentDetail {
  id: string;
  propertyId: string;
  name: string;
  phoneLast4: string | null;
  unitId: string | null;
  buildingId: string | null;
  buildingName: string | null;
  unitNumber: string | null;
  relationType: string | null;
  representative: boolean;
  signupStatus: ResidentSignupStatus;
  serviceRole?: 'ADMIN' | 'MANAGER' | 'RESIDENT' | 'CONFLICT' | null;
  createdAt: string;
  updatedAt: string;
  hasLinkedRequests: boolean;
  representativeCandidates: { id: string; name: string }[];
}

export interface ResidentUpdateInput {
  name: string;
  unitId: string;
  relationType: string;
  phoneAction: 'KEEP' | 'REPLACE' | 'REMOVE';
  phone: string | null;
  replacementResidentId: string | null;
  expectedUpdatedAt: string;
  serviceRole?: 'MANAGER' | 'RESIDENT';
  expectedServiceRole?: 'MANAGER' | 'RESIDENT';
}

/** 기본 상세·수정 응답은 마스킹만 허용하고 전체 연락처가 캐시·목록에 섞인 응답을 거부합니다. */
function readDetail(result: ResidentDetail | undefined, propertyId: string, residentId: string): ResidentDetail {
  if (!result || result.id !== residentId || result.propertyId !== propertyId || typeof result.name !== 'string' || !result.name.trim()
    || !(result.phoneLast4 === null || (typeof result.phoneLast4 === 'string' && /^\d{4}$/.test(result.phoneLast4)))
    || !(result.unitId === null || isPropertyId(result.unitId)) || !(result.buildingId === null || isPropertyId(result.buildingId))
    || !(result.unitNumber === null || typeof result.unitNumber === 'string')
    || !(result.buildingName === null || typeof result.buildingName === 'string')
    || !(result.relationType === null || RESIDENT_RELATION_OPTIONS.some((item) => item.value === result.relationType))
    || !RESIDENT_SIGNUP_OPTIONS.some((item) => item.value === result.signupStatus)
    || !(result.serviceRole === undefined || result.serviceRole === null || ['ADMIN', 'MANAGER', 'RESIDENT', 'CONFLICT'].includes(result.serviceRole))
    || typeof result.representative !== 'boolean' || typeof result.hasLinkedRequests !== 'boolean'
    || !Number.isFinite(Date.parse(result.createdAt)) || !Number.isFinite(Date.parse(result.updatedAt))
    || !Array.isArray(result.representativeCandidates)
    || result.representativeCandidates.some((item) => !item || !isPropertyId(item.id) || item.id === residentId || typeof item.name !== 'string' || !item.name.trim())
    || ['phone', 'phoneEncrypted', 'phoneHmac', 'userId'].some((key) => Object.hasOwn(result, key))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '주민 정보를 확인할 수 없습니다.');
  }

  return result;
}

export async function getResidentDetail(propertyId: string, residentId: string) {
  return readDetail(await authenticatedAPI<ResidentDetail>({
    url: `/api/properties/${propertyId}/residents/${residentId}`
  }), propertyId, residentId);
}

/** 공개 버튼에만 호출하며 전체 번호는 조회 캐시나 저장소에 넣지 않고 호출자의 일시 상태로 돌려줍니다. */
export async function revealResidentPhone(propertyId: string, residentId: string) {
  const result = await authenticatedAPI<{ phone: string | null }>({
    url: `/api/properties/${propertyId}/residents/${residentId}/phone-reveal`,
    method: 'POST'
  });
  if (!result || !(result.phone === null || (typeof result.phone === 'string' && /^\+[1-9]\d{3,14}$/.test(result.phone)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '연락처를 확인할 수 없습니다.');
  }

  return result.phone;
}

export async function updateResident(propertyId: string, residentId: string, input: ResidentUpdateInput) {
  return readDetail(await authenticatedAPI<ResidentDetail>({
    url: `/api/properties/${propertyId}/residents/${residentId}`,
    method: 'PUT',
    data: input
  }), propertyId, residentId);
}

/** 삭제 대상과 상세 조회 시각·직접 선택한 대표만 보내고 권한 종료는 서버 트랜잭션에 맡깁니다. */
export async function deleteResident(propertyId: string, residentId: string, expectedUpdatedAt: string, replacementResidentId: string | null) {
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/residents/${residentId}`,
    method: 'DELETE',
    data: {
      expectedUpdatedAt,
      replacementResidentId
    }
  });
}
