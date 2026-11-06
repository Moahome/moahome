import { isPropertyId } from '@/entities/property';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS
} from '@/entities/resident';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  ResidentDetail,
  ResidentPhoneResponse,
  ResidentUpdateInput
} from './residentManagementApiTypes';

/** 기본 상세·수정 응답은 마스킹만 허용하고 전체 연락처가 캐시·목록에 섞인 응답을 거부합니다. */
function readDetail(result: ResidentDetail | undefined, propertyId: string, residentId: string): ResidentDetail {
  if (!result || result.id !== residentId || result.propertyId !== propertyId || typeof result.name !== 'string' || !result.name.trim()
    || !(result.phoneLast4 === null || (typeof result.phoneLast4 === 'string' && /^\d{4}$/.test(result.phoneLast4)))
    || !(result.phoneConsent === undefined || typeof result.phoneConsent === 'boolean')
    || (result.phoneConsent === true && result.phoneLast4 === null)
    || !(result.unitId === null || isPropertyId(result.unitId)) || !(result.buildingId === null || isPropertyId(result.buildingId))
    || !(result.unitNumber === null || typeof result.unitNumber === 'string')
    || !(result.buildingName === null || typeof result.buildingName === 'string')
    || !(result.relationType === null || RESIDENT_RELATION_OPTIONS.some((item) => item.value === result.relationType))
    || !RESIDENT_SIGNUP_OPTIONS.some((item) => item.value === result.signupStatus)
    || !(result.serviceRole === undefined || result.serviceRole === null || ['ADMIN', 'MANAGER', 'RESIDENT', 'CONFLICT'].includes(result.serviceRole))
    || typeof result.representative !== 'boolean' || typeof result.hasLinkedRequests !== 'boolean'
    || !(result.currentRepresentativeId === undefined || result.currentRepresentativeId === null || isPropertyId(result.currentRepresentativeId))
    || !Number.isFinite(Date.parse(result.createdAt)) || !Number.isFinite(Date.parse(result.updatedAt))
    || !Array.isArray(result.representativeCandidates)
    || result.representativeCandidates.some((item) => !item || !isPropertyId(item.id) || item.id === residentId || typeof item.name !== 'string' || !item.name.trim())
    || ['phone', 'phoneEncrypted', 'phoneHmac', 'userId'].some((key) => Object.hasOwn(result, key))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '주민 정보를 확인할 수 없습니다.');
  }

  return result;
}

export async function getResidentDetail(propertyId: string, residentId: string, signal?: AbortSignal) {
  return readDetail(await authenticatedAPI<ResidentDetail>({
    signal,
    url: `/api/properties/${propertyId}/residents/${residentId}`
  }), propertyId, residentId);
}

/** 공개 버튼에만 호출하며 전체 번호는 조회 캐시나 저장소에 넣지 않고 호출자의 일시 상태로 돌려줍니다. */
export async function revealResidentPhone(propertyId: string, residentId: string) {
  const result = await authenticatedAPI<ResidentPhoneResponse>({
    url: `/api/properties/${propertyId}/residents/${residentId}/phone-reveal`,
    method: 'POST'
  });
  if (!result || !(result.phone === null || (typeof result.phone === 'string' && /^\+[1-9]\d{3,14}$/.test(result.phone)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '연락처를 확인할 수 없습니다.');
  }

  return result.phone;
}

/** 대표 지정 요청은 HTTP 성공뿐 아니라 응답의 세대·대표 여부까지 일치해야 완료로 처리합니다. */
function requireRepresentativeResult(result: ResidentDetail, unitId: string | null) {
  if (!result.representative || result.unitId !== unitId
    || (result.currentRepresentativeId !== undefined && result.currentRepresentativeId !== result.id)) {
    throw new ApiError(200, 'REPRESENTATIVE_NOT_APPLIED', '대표 지정이 반영되지 않았습니다.');
  }
  return result;
}

export async function updateResident(propertyId: string, residentId: string, input: ResidentUpdateInput) {
  const result = readDetail(await authenticatedAPI<ResidentDetail>({
    url: `/api/properties/${propertyId}/residents/${residentId}`,
    method: 'PUT',
    data: input
  }), propertyId, residentId);
  return input.designateRepresentative ? requireRepresentativeResult(result, input.unitId) : result;
}

/** 현재 세대·대표·수정 시각을 함께 검증하며 명부나 계정 권한을 변경하지 않고 대표만 지정합니다. */
export async function designateResidentRepresentative(propertyId: string, resident: ResidentDetail) {
  try {
    const result = readDetail(await authenticatedAPI<ResidentDetail>({
      url: `/api/properties/${propertyId}/residents/${resident.id}/representative`,
      method: 'PUT',
      data: {
        unitId: resident.unitId,
        expectedUpdatedAt: resident.updatedAt,
        expectedRepresentativeResidentId: resident.currentRepresentativeId ?? null
      }
    }), propertyId, resident.id);
    return requireRepresentativeResult(result, resident.unitId);
  } catch (error) {
    // 명부 부재는 기존 오류를 유지하고, 전용 경로를 제공하지 않는 서버의 404를 구분합니다.
    if (error instanceof ApiError && error.status === 404 && error.code !== 'RESIDENT_NOT_FOUND') {
      throw new ApiError(404, 'REPRESENTATIVE_UNAVAILABLE', '대표 지정 기능에 연결할 수 없습니다.');
    }
    throw error;
  }
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
