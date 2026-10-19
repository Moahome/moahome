'use client';

import type { ManagedPropertiesResponse } from './managementAccessApiTypes';

import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type { ManagementProperty } from './managementAccessApiTypes';

/** 잘못된 자료형·주민 역할을 관리 권한으로 해석하지 않습니다. */
function isManagementProperty(value: unknown): value is ManagementProperty {
  if (!value || typeof value !== 'object') return false;
  const property = value as Partial<ManagementProperty>;
  return isPropertyId(property.propertyId) && typeof property.name === 'string' && Boolean(property.name.trim())
    && (property.role === 'ADMIN' || property.role === 'MANAGER');
}

/** 브라우저 등록 기록 없이 서버의 현재 관리대상 전체를 조회합니다. */
export async function getManagedProperties(): Promise<ManagementProperty[]> {
  const response = await authenticatedAPI<ManagedPropertiesResponse>({
    url: '/api/users/me/managed-properties'
  });
  if (!response || !Array.isArray(response.properties) || !response.properties.every(isManagementProperty)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리할 곳 목록을 확인할 수 없습니다.');
  }
  if (new Set(response.properties.map((property) => property.propertyId)).size !== response.properties.length) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리할 곳 목록을 확인할 수 없습니다.');
  }
  return response.properties;
}

/** 직접 접근은 현재 관리자 역할과 응답의 대상 ID까지 확인합니다. */
export async function getManagementContext(propertyId: string): Promise<ManagementProperty> {
  const response = await authenticatedAPI<unknown>({
    url: `/api/properties/${propertyId}/management-context`
  });
  if (!isManagementProperty(response) || response.propertyId !== propertyId) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리 권한을 확인할 수 없습니다.');
  }
  return response;
}
