import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  SignupRequest,
  SignupWorkspace,
  UnlinkedResidents
} from './membershipRequestApiTypes';

/** 가입 상태를 미연결 여부로 대신 판단하지 않고 서버가 확인한 명부만 받아 표시합니다. */
export async function getUnlinkedResidents(propertyId: string) {
  const value = await authenticatedAPI<UnlinkedResidents>({
    url: `/api/properties/${propertyId}/membership-requests/unlinked-residents`
  });
  if (!value || value.propertyId !== propertyId || !Array.isArray(value.residents)
    || value.residents.some((row) => !isPropertyId(row.residentId) || typeof row.name !== 'string'
      || (row.phoneLast4 !== null && (typeof row.phoneLast4 !== 'string' || !/^\d{4}$/.test(row.phoneLast4)))
      || (row.buildingName !== null && typeof row.buildingName !== 'string')
      || (row.unitNumber !== null && typeof row.unitNumber !== 'string')
      || (row.relationType !== null && !['OWNER', 'TENANT', 'FAMILY', 'OTHER'].includes(row.relationType)))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '미연결 주민 응답을 확인할 수 없습니다.');
  }

  return value;
}

function read(value: SignupWorkspace, property: string) {
  if (!value || value.propertyId !== property || !Array.isArray(value.requests)
    || value.requests.some((r) => !isPropertyId(r.id) || !isPropertyId(r.unitId) || typeof r.requesterName !== 'string'
      || !['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'].includes(r.status) || !Number.isFinite(Date.parse(r.updatedAt))
      || !Array.isArray(r.candidates) || r.candidates.some((c) => !isPropertyId(c.residentId) || typeof c.name !== 'string'))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '가입 요청 응답을 확인할 수 없습니다.');
  }

  return value;
}
export async function getSignupRequests(property: string) {
  return read(await authenticatedAPI<SignupWorkspace>({
    url: `/api/properties/${property}/membership-requests`
  }), property);
}
export async function reviewSignupRequest(property: string, request: SignupRequest, residentId: string | null) {
  return read(await authenticatedAPI<SignupWorkspace>({
    url: `/api/properties/${property}/membership-requests/${request.id}/${residentId ? 'approve' : 'reject'}`,
    method: 'POST',
    data: {
      expectedUpdatedAt: request.updatedAt,
      ...(residentId ? {
        residentId
      } : {})
    }
  }), property);
}
