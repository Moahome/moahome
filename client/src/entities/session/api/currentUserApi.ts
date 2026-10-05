'use client';

import { ApiError } from '@/shared/api';
import { authenticatedAPI } from './authenticatedApi';

export interface CurrentUser {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  systemRole: 'USER' | 'ADMIN';
  status: 'ACTIVE';
}

/** 인증된 본인 정보를 조회하고 잘못된 응답을 로그인 성공으로 표시하지 않습니다. */
export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await authenticatedAPI<CurrentUser>({
    url: '/api/users/me'
  });

  if (
    !user ||
    typeof user.id !== 'string' ||
    !user.id.trim() ||
    typeof user.displayName !== 'string' ||
    !user.displayName.trim() ||
    !(user.profileImageUrl === null || typeof user.profileImageUrl === 'string') ||
    !['USER', 'ADMIN'].includes(user.systemRole) ||
    user.status !== 'ACTIVE'
  ) {
    throw new ApiError(200, 'INVALID_RESPONSE', '사용자 정보를 확인할 수 없습니다.');
  }

  return user;
}
