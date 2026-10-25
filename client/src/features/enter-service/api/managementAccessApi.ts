'use client';

import type { ManagedPropertiesResponse } from './managementAccessApiTypes';

import { isPropertyId } from '@/entities/property';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  ManagementProperty,
  PropertyAccessContext,
  ResidentProperty,
  ResidentPropertiesResponse
} from './managementAccessApiTypes';

/** 잘못된 자료형·주민 역할을 관리 권한으로 해석하지 않습니다. */
function isManagementProperty(value: unknown): value is ManagementProperty {
  if (!value || typeof value !== 'object') return false;
  const property = value as Partial<ManagementProperty>;
  return isPropertyId(property.propertyId) && typeof property.name === 'string' && Boolean(property.name.trim())
    && (property.role === 'ADMIN' || property.role === 'MANAGER');
}

/** 브라우저 등록 기록 없이 서버의 현재 관리대상 전체를 조회합니다. */
export async function getManagedProperties(signal?: AbortSignal): Promise<ManagementProperty[]> {
  const response = await authenticatedAPI<ManagedPropertiesResponse>({
    signal,
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
export async function getManagementContext(propertyId: string, signal?: AbortSignal): Promise<ManagementProperty> {
  const response = await authenticatedAPI<unknown>({
    signal,
    url: `/api/properties/${propertyId}/management-context`
  });
  if (!isManagementProperty(response) || response.propertyId !== propertyId) {
    throw new ApiError(200, 'INVALID_RESPONSE', '관리 권한을 확인할 수 없습니다.');
  }
  return response;
}

/** 주민 참여 목록은 관리 권한 검사와 별도로 읽고 관리자 역할을 주민으로 해석하지 않습니다. */
export async function getResidentProperties(signal?: AbortSignal): Promise<ResidentProperty[]> {
  const response = await authenticatedAPI<ResidentPropertiesResponse>({
    signal,
    url: '/api/users/me/resident-properties'
  });
  if (!response || !Array.isArray(response.properties) || response.properties.some((row) => !row || !isPropertyId(row.propertyId) || typeof row.name !== 'string' || !row.name.trim() || row.role !== 'RESIDENT')
    || new Set(response.properties.map((row) => row.propertyId)).size !== response.properties.length) {
    throw new ApiError(200, 'INVALID_RESPONSE', '주민 참여 정보를 확인할 수 없습니다.');
  }
  return response.properties;
}

/** 현재 대상의 역할과 주민 자격만 읽고 다른 대상이나 잘못된 응답을 접근 근거로 사용하지 않습니다. */
export async function getPropertyAccessContext(propertyId: string, signal?: AbortSignal): Promise<PropertyAccessContext> {
  const response = await authenticatedAPI<PropertyAccessContext>({
    url: `/api/properties/${propertyId}/access-context`,
    signal
  });
  if (!response || response.propertyId !== propertyId || !isPropertyId(response.propertyId)
    || typeof response.name !== 'string' || !response.name.trim()
    || !['ADMIN', 'MANAGER', 'RESIDENT'].includes(response.role) || typeof response.residentEligible !== 'boolean') {
    throw new ApiError(200, 'INVALID_RESPONSE', '현재 접근 권한을 확인할 수 없습니다.');
  }
  return response;
}
