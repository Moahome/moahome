'use client';

import { ApiError } from '@/shared/api';
import { authenticatedAPI } from './authenticatedApi';
import type { CurrentUser } from './currentUserApiTypes';

/** 인증된 본인 정보를 조회하고 잘못된 응답을 로그인 성공으로 표시하지 않습니다. */
export async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  const user = await authenticatedAPI<CurrentUser>({
    url: '/api/users/me',
    signal
  });

  return readCurrentUser(user);
}

/** 본인의 표시 이름만 저장하고 서버의 최신 계정 정보를 반환합니다. 이미지·명부·권한은 전송하지 않습니다. */
export async function updateCurrentUserDisplayName(displayName: string): Promise<CurrentUser> {
  const user = await authenticatedAPI<CurrentUser>({
    url: '/api/users/me',
    method: 'PATCH',
    data: {
      displayName
    }
  });

  return readCurrentUser(user);
}

/** 사진과 이름을 같은 요청으로 저장하며 사용자 ID·S3 키·임의 이미지 주소를 전송하지 않습니다. */
export async function saveCurrentUserProfile(displayName: string, image: File | null, removeImage: boolean): Promise<CurrentUser> {
  const data = new FormData();
  data.set('displayName', displayName);
  data.set('removeImage', String(removeImage));
  if (image) data.set('image', image);
  const user = await authenticatedAPI<CurrentUser>({
    url: '/api/users/me/profile',
    method: 'PUT',
    data,
    timeoutMs: 35_000
  });

  return readCurrentUser(user);
}

/** 조회와 수정 응답에 같은 검증을 적용해 잘못된 계정 정보가 전역 캐시에 들어가지 않게 합니다. */
function readCurrentUser(user: CurrentUser): CurrentUser {
  if (
    !user ||
    typeof user.id !== 'string' ||
    !user.id.trim() ||
    typeof user.displayName !== 'string' ||
    !user.displayName.trim() ||
    !(user.profileImageUrl === null || typeof user.profileImageUrl === 'string') ||
    !['USER', 'ADMIN'].includes(user.systemRole) ||
    (user.canCreateProperty !== undefined && typeof user.canCreateProperty !== 'boolean') ||
    user.status !== 'ACTIVE'
  ) {
    throw new ApiError(200, 'INVALID_RESPONSE', '사용자 정보를 확인할 수 없습니다.');
  }

  // 이전 API 응답의 누락 필드는 생성 허용으로 추정하지 않습니다.
  return {
    ...user,
    canCreateProperty: user.canCreateProperty === true
  };
}
