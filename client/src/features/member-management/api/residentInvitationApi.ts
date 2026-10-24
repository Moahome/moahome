import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';
import type {
  ResidentInvitationWorkspace,
  ResidentInvitationShare,
  IssuedResidentInvitation,
  ResidentInvitationPreview,
  ResidentJoinOptions,
  ResidentInvitationAcceptance,
  ResidentJoinSubmission,
  ResidentInvitationResult,
  ResidentJoinResult
} from './residentInvitationApiTypes';

const ROOT = '/api/resident-invitations';
/** 초대 원문을 조회 캐시·URL 쿼리·브라우저 저장소에 보관하지 않고 본문으로만 전송합니다. */
export async function issueResidentInvitation(propertyId: string, residentId?: string) {
  const value = await authenticatedAPI<IssuedResidentInvitation>({
    url: `/api/properties/${propertyId}/resident-invitations/${residentId ? `residents/${residentId}` : 'shared-code'}`,
    method: 'POST'
  });
  if (!value || !isPropertyId(value.id) || !/^[RB](?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(value.token) || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '초대코드를 확인할 수 없습니다.');
  }
  return value;
}
/** 같은 유효 코드를 다시 받아 전달하며 발급 시각·유효기간을 바꾸지 않습니다. */
export async function openResidentInvitation(propertyId: string, id: string) {
  const value = await authenticatedAPI<ResidentInvitationShare>({
    url: `/api/properties/${propertyId}/resident-invitations/${id}/share`,
    method: 'POST'
  });
  if (!value || value.id !== id || (value.token !== null && !/^R(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(value.token)) || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '초대코드를 확인할 수 없습니다.');
  }
  return value;
}
/** 사용자가 보관한 원문만 기존 초대에 복원하며 새 초대를 만들거나 유효기간을 연장하지 않습니다. */
export async function restoreResidentInvitation(propertyId: string, id: string, token: string) {
  const value = await authenticatedAPI<IssuedResidentInvitation>({
    url: `/api/properties/${propertyId}/resident-invitations/${id}/restore`,
    method: 'POST',
    data: {
      token
    }
  });
  if (!value || value.id !== id || !/^R(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(value.token) || !Number.isFinite(Date.parse(value.expiresAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '초대코드를 확인할 수 없습니다.');
  }
  return value;
}
export async function getResidentInvitations(propertyId: string) {
  return read(await authenticatedAPI<ResidentInvitationWorkspace>({
    url: `/api/properties/${propertyId}/resident-invitations`
  }), propertyId);
}
function read(value: ResidentInvitationWorkspace, propertyId: string) {
  if (!value || value.propertyId !== propertyId || !Array.isArray(value.invitations)
    || value.invitations.some((row) => !isPropertyId(row.id) || !isPropertyId(row.residentId) || typeof row.name !== 'string'
      || !Number.isSafeInteger(row.revision) || !['ISSUED', 'EXPIRED', 'CHANGE_REQUESTED', 'APPROVED', 'REVOKED', 'REJECTED'].includes(row.status))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '초대 목록을 확인할 수 없습니다.');
  }
  return value;
}
export async function reviewResidentInvitation(propertyId: string, id: string, revision: number, action: 'approve' | 'reject' | 'revoke') {
  return read(await authenticatedAPI<ResidentInvitationWorkspace>({
    url: `/api/properties/${propertyId}/resident-invitations/${id}/${action}`,
    method: 'POST',
    data: {
      revision
    }
  }), propertyId);
}
export async function previewResidentInvitation(token: string) {
  const value = await authenticatedAPI<ResidentInvitationPreview>({
    url: `${ROOT}/preview`,
    method: 'POST',
    data: {
      token
    }
  });
  if (!value || typeof value.name !== 'string' || typeof value.unitLabel !== 'string' || typeof value.propertyName !== 'string'
    || !['ISSUED', 'CHANGE_REQUESTED', 'APPROVED'].includes(value.status)) throw new ApiError(200, 'INVALID_RESPONSE', '초대 정보를 확인할 수 없습니다.');
  return value;
}
export async function acceptResidentInvitation(input: ResidentInvitationAcceptance) {
  const value = await authenticatedAPI<ResidentInvitationResult>({
    url: `${ROOT}/accept`,
    method: 'POST',
    data: input
  });
  if (!value || !['APPROVED', 'CHANGE_REQUESTED'].includes(value.status)) throw new ApiError(200, 'INVALID_RESPONSE', '가입 결과를 확인할 수 없습니다.');
  return value;
}
export async function getResidentJoinOptions(token: string) {
  const value = await authenticatedAPI<ResidentJoinOptions>({
    url: `${ROOT}/shared-options`,
    method: 'POST',
    data: {
      token
    }
  });
  if (!value || !isPropertyId(value.propertyId) || typeof value.propertyName !== 'string' || !Array.isArray(value.units)
    || value.units.some((unit) => !isPropertyId(unit.unitId) || typeof unit.label !== 'string')) throw new ApiError(200, 'INVALID_RESPONSE', '참여 정보를 확인할 수 없습니다.');
  return value;
}
export async function submitResidentJoin(propertyId: string, input: ResidentJoinSubmission) {
  const value = await authenticatedAPI<ResidentJoinResult>({
    url: `/api/properties/${propertyId}/membership-requests`,
    method: 'POST',
    data: input
  });
  if (!value || !isPropertyId(value.id) || value.status !== 'PENDING') throw new ApiError(200, 'INVALID_RESPONSE', '가입 신청을 확인할 수 없습니다.');
  return value;
}
