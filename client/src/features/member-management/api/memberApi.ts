import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';

export type MemberRole = 'ADMIN' | 'MANAGER' | 'RESIDENT';
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  ADMIN: '관리소장',
  MANAGER: '부담당자',
  RESIDENT: '주민'
};
export interface MemberWorkspace {
  propertyId: string;
  members: { memberId: string; name: string; residentId: string | null; role: MemberRole }[];
  invitations: { id: string; revision: number; status: string; role: MemberRole; residentId: string | null;
    residentName: string | null; requesterName: string | null; expiresAt: string }[];
}
export interface IssuedInvitation {
  id: string;
  code: string;
  expiresAt: string;
}
function read(value: MemberWorkspace, property: string) {
  if (!value || value.propertyId !== property || !Array.isArray(value.members) || !Array.isArray(value.invitations)
    || value.members.some((m) => !isPropertyId(m.memberId) || typeof m.name !== 'string' || !Object.hasOwn(MEMBER_ROLE_LABELS, m.role))
    || value.invitations.some((i) => !isPropertyId(i.id) || !Number.isSafeInteger(i.revision)
      || !['ISSUED', 'REQUESTED', 'APPROVED', 'REVOKED', 'EXPIRED'].includes(i.status))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '참여자 응답을 확인할 수 없습니다.');
  }

  return value;
}
export async function getMembers(property: string) {
  return read(await authenticatedAPI<MemberWorkspace>({
    url: `/api/properties/${property}/members`
  }), property);
}
/** 현재 로그인한 관리소장만 선택한 명부와 연결하며 화면에서 확인한 현재 세대가 달라지면 서버에서 거부합니다. */
export async function linkOwnChiefResident(propertyId: string, residentId: string, expectedUnitId: string) {
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/members/me/resident`,
    method: 'PUT',
    data: {
      residentId,
      expectedUnitId
    }
  });
}

export async function changeResidentRole(property: string, resident: string, role: MemberRole, expectedRole: MemberRole) {
  await authenticatedAPI<void>({
    url: `/api/properties/${property}/members/residents/${resident}/role`,
    method: 'PUT',
    data: {
      role,
      expectedRole
    }
  });
}
export async function changeMemberRole(property: string, member: string, role: MemberRole, expectedRole: MemberRole) {
  return read(await authenticatedAPI<MemberWorkspace>({
    url: `/api/properties/${property}/members/${member}/role`,
    method: 'PUT',
    data: {
      role,
      expectedRole
    }
  }), property);
}
export async function transferManagement(property: string, member: string, expectedRole: MemberRole) {
  await authenticatedAPI<void>({
    url: `/api/properties/${property}/members/${member}/transfer`,
    method: 'POST',
    data: {
      role: 'ADMIN',
      expectedRole
    }
  });
}
export async function endManagerAccess(property: string, member: string) {
  return read(await authenticatedAPI<MemberWorkspace>({
    url: `/api/properties/${property}/members/${member}`,
    method: 'DELETE'
  }), property);
}
export async function issueMemberInvitation(property: string, residentId: string | null = null) {
  const result = await authenticatedAPI<IssuedInvitation>({
    url: `/api/properties/${property}/members/invitations`,
    method: 'POST',
    data: {
      residentId
    }
  });
  if (!result || !isPropertyId(result.id) || !/^[A-Za-z0-9_-]{32}$/.test(result.code) || !Number.isFinite(Date.parse(result.expiresAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '초대코드를 확인할 수 없습니다.');
  }

  return result;
}
export async function reviewMemberInvitation(property: string, id: string, revision: number, action: 'approve' | 'revoke') {
  return read(await authenticatedAPI<MemberWorkspace>({
    url: `/api/properties/${property}/members/invitations/${id}/${action}`,
    method: 'POST',
    data: {
      revision
    }
  }), property);
}
export async function requestMemberInvitation(code: string) {
  const result = await authenticatedAPI<{ propertyName: string; status: string }>({
    url: '/api/member-invitations/request',
    method: 'POST',
    data: {
      code: code.trim()
    }
  });
  if (!result || typeof result.propertyName !== 'string' || result.status !== 'REQUESTED') throw new ApiError(200, 'INVALID_RESPONSE', '초대 신청 결과를 확인할 수 없습니다.');

  return result;
}
export function memberManagementError(error: unknown) {
  if (!(error instanceof ApiError)) return '권한 정보를 처리하지 못했어요. 다시 확인해주세요.';
  const messages: Record<string, string> = {
    MEMBER_ACCOUNT_REQUIRED: '계정 연결과 가입 승인이 완료된 주민만 역할을 변경할 수 있어요.',
    MEMBER_ROLE_CONFLICT: '역할이나 신청 상태가 변경됐어요. 최신 정보를 확인해주세요. 관리소장 변경은 인계를 사용해주세요.',
    MEMBER_RESIDENT_REQUIRED: '현재 주민 연결이 필요해요. 외부 부담당자는 관리자 접근 종료를 사용해주세요.',
    MEMBER_NOT_FOUND: '해당 관리대상의 참여자 또는 초대를 찾을 수 없어요.',
    INVALID_INVITATION: '초대코드가 만료되었거나 사용할 수 없어요. 새 코드를 요청해주세요.',
    ACCESS_DENIED: '관리소장만 권한을 변경할 수 있어요.',
    INVALID_REQUEST: '입력한 역할과 초대코드를 확인해주세요.'
  };

  return messages[error.code] ?? '권한 정보를 처리하지 못했어요. 최신 정보를 확인해주세요.';
}

