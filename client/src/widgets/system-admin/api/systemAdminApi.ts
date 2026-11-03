import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  SystemMember,
  SystemMembers,
  MemberSearch,
  AdminCommand
} from './systemAdminApiTypes';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 권한 응답의 누락·잘못된 역할을 허용으로 추정하지 않습니다. */
function readMember(value: SystemMember): SystemMember {
  if (!value || !UUID.test(value.id) || typeof value.displayName !== 'string'
    || !['ACTIVE', 'SUSPENDED', 'WITHDRAWN'].includes(value.status)
    || !['USER', 'ADMIN'].includes(value.systemRole) || typeof value.canCreateProperty !== 'boolean'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '회원 정보를 확인할 수 없습니다.');
  }
  return value;
}

export async function getSystemMembers(filters: MemberSearch, signal?: AbortSignal): Promise<SystemMembers> {
  const query = new URLSearchParams({
    query: filters.query,
    administrators: String(filters.administrators),
    page: String(filters.page),
    size: String(filters.size)
  });
  const result = await authenticatedAPI<SystemMembers>({
    url: `/api/system-admin/users?${query}`,
    signal
  });
  if (!result || !Array.isArray(result.users) || !Number.isInteger(result.total) || result.total < 0
    || result.page !== filters.page || result.pageSize !== filters.size || !Number.isInteger(result.pageCount) || result.pageCount < 1) {
    throw new ApiError(200, 'INVALID_RESPONSE', '회원 목록을 확인할 수 없습니다.');
  }
  result.users.forEach(readMember);
  return result;
}
export async function getSystemMember(id: string, signal?: AbortSignal) {
  const result = readMember(await authenticatedAPI<SystemMember>({
    url: `/api/system-admin/users/${id}`,
    signal
  }));
  if (result.id !== id) throw new ApiError(200, 'INVALID_RESPONSE', '회원 정보를 확인할 수 없습니다.');
  return result;
}

/** 화면의 명시적 확인 이후에만 변경하고 응답 유실 재시도에는 같은 요청 UUID를 사용합니다. */
export async function changeSystemMember(id: string, command: AdminCommand) {
  const { kind, ...data } = command;
  const result = readMember(await authenticatedAPI<SystemMember>({
    url: `/api/system-admin/users/${id}/${kind === 'permission' ? 'creation-permission' : 'promotion'}`,
    method: 'POST',
    data
  }));
  if (result.id !== id) throw new ApiError(200, 'INVALID_RESPONSE', '회원 정보를 확인할 수 없습니다.');
  return result;
}
export function systemAdminError(error: unknown): string {
  if (!(error instanceof ApiError)) return '권한을 변경하지 못했습니다. 다시 시도해주세요.';
  const messages: Record<string, string> = {
    ACCESS_DENIED: '시스템 관리자 권한을 확인해주세요.',
    ACCOUNT_UNAVAILABLE: '이용할 수 없는 계정입니다.',
    ADMIN_STATE_CONFLICT: '회원 권한이 변경됐습니다. 최신 정보를 확인해주세요.',
    ADMIN_REQUEST_CONFLICT: '이미 다른 내용으로 처리한 요청입니다.',
    ADMIN_USER_NOT_FOUND: '회원을 찾을 수 없습니다.',
    ADMIN_SERVICE_UNAVAILABLE: '시스템 관리를 일시적으로 사용할 수 없습니다.',
    INVALID_RESPONSE: '회원 정보를 확인할 수 없습니다.'
  };
  return messages[error.code] ?? '권한을 변경하지 못했습니다. 다시 시도해주세요.';
}
