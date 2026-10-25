import { authenticatedAPI } from '@/entities/session';
import type { LeavePropertyRequest } from './leavePropertyApiTypes';

/** 본인 식별·권한과 퇴거 가능 여부는 서버에서 확인하고 선택한 종료 방식만 전달합니다. */
export async function leaveProperty(propertyId: string, input: LeavePropertyRequest) {
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/members/me/leave`,
    method: 'POST',
    data: input
  });
}
