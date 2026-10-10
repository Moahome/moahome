'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getManagedPropertiesQueryKey,
  isPropertyId
} from '@/entities/property';
import { ApiError } from '@/shared/api';
import {
  getManagedProperties,
  getManagementContext
} from '../api/managementAccessApi';
import {
  forgetRecentProperty,
  readRecentProperty,
  rememberRecentProperty
} from './recentProperty';

const FRESH_ACCESS_QUERY_OPTIONS = {
  staleTime: 0,
  retry: false,
  refetchOnMount: 'always',
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  networkMode: 'always',
} as const;

/** 최근 대상도 현재 서버 목록에 있을 때만 선택하며 실제 빈 목록만 시작 화면으로 보냅니다. */
export function useManagementEntry(userId: string | undefined, enabled = true) {
  return useQuery({
    ...FRESH_ACCESS_QUERY_OPTIONS,
    queryKey: getManagedPropertiesQueryKey(userId),
    enabled: Boolean(userId) && enabled,
    queryFn: async () => {
      const properties = await getManagedProperties();
      const recentId = readRecentProperty(userId!);
      const recent = properties.find((property) => property.propertyId === recentId);
      if (recentId && !recent) forgetRecentProperty(userId!, recentId);
      return recent ?? properties[0] ?? null;
    }
  });
}

/** 공통 레이아웃에서 현재 권한을 검증하며 그 안의 화면은 이미 검증한 결과를 재조회 없이 공유할 수 있습니다. */
export function useManagementContext(userId: string | undefined, propertyId: string, revalidateOnMount = true) {
  return useQuery({
    ...FRESH_ACCESS_QUERY_OPTIONS,
    // 하위 화면의 재마운트가 부모의 조회 중 숨김과 반복되지 않도록 같은 결과를 구독할 때는 재조회를 생략합니다.
    refetchOnMount: revalidateOnMount ? 'always' : false,
    queryKey: ['management-context', userId, propertyId],
    enabled: Boolean(userId) && isPropertyId(propertyId),
    queryFn: async () => {
      try {
        const property = await getManagementContext(propertyId);
        rememberRecentProperty(userId!, propertyId);
        return property;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'ACCESS_DENIED') {
          forgetRecentProperty(userId!, propertyId);
        }
        throw error;
      }
    }
  });
}
