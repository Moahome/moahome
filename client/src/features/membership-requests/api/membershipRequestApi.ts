import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  SignupOptions,
  SignupRequest,
  SignupRequestResponse,
  SignupWorkspace
} from './membershipRequestApiTypes';

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
export async function getSignupOptions(property: string) {
  const value = await authenticatedAPI<SignupOptions>({
    url: `/api/properties/${property}/membership-requests/options`
  });
  if (!value || value.propertyId !== property || typeof value.propertyName !== 'string' || !Array.isArray(value.units)
    || value.units.some((u) => !isPropertyId(u.unitId) || typeof u.label !== 'string')) {
    throw new ApiError(200, 'INVALID_RESPONSE', '참여 정보를 확인할 수 없습니다.');
  }

  return value;
}
export async function submitSignupRequest(property: string, unitId: string, phone: string) {
  const value = await authenticatedAPI<SignupRequestResponse>({
    url: `/api/properties/${property}/membership-requests`,
    method: 'POST',
    data: {
      unitId,
      phone
    }
  });
  if (!value || !isPropertyId(value.id) || value.status !== 'PENDING') throw new ApiError(200, 'INVALID_RESPONSE', '신청 결과를 확인할 수 없습니다.');

  return value;
}

