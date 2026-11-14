import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type { NoticeAccessLink } from './residentNoticeManagementApiTypes';

function base(propertyId: string) {
  return `/api/properties/${propertyId}/resident-notices`;
}

function readLink(link: NoticeAccessLink | null | undefined) {
  if (link == null) return null;
  if (typeof link.id !== 'string' || !Number.isFinite(Date.parse(link.createdAt))
    || (link.token !== null && !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(link.token))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '주민 열람 링크를 확인할 수 없습니다.');
  }
  return link;
}

export async function getNoticeAccessLink(propertyId: string, signal?: AbortSignal) {
  return readLink(await authenticatedAPI<NoticeAccessLink | null>({
    url: `${base(propertyId)}/access-link`,
    signal
  }));
}

/** 발급 결과 유실에도 같은 ID로 재시도해 건물별 활성 링크 하나를 복구합니다. */
export async function createNoticeAccessLink(propertyId: string, requestId: string) {
  const result = readLink(await authenticatedAPI<NoticeAccessLink>({
    url: `${base(propertyId)}/access-link/${requestId}`,
    method: 'PUT'
  }));
  if (!result) throw new ApiError(200, 'INVALID_RESPONSE', '링크 발급 결과를 확인할 수 없습니다.');
  return result;
}

export function revokeNoticeAccessLink(propertyId: string, id: string) {
  return authenticatedAPI<void>({
    url: `${base(propertyId)}/access-link/${id}`,
    method: 'DELETE'
  });
}
