'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getManagedPropertiesQueryKey,
  isPropertyId
} from '@/entities/property';
import {
  getManagedProperties,
  getResidentProperties,
  getPropertyAccessContext
} from '../api/managementAccessApi';
import {
  forgetRecentProperty,
  readRecentProperty,
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
    queryFn: async ({ signal }) => {
      const properties = await getManagedProperties(signal);
      const recentId = readRecentProperty(userId!);
      const recent = properties.find((property) => property.propertyId === recentId);
      if (recentId && !recent) forgetRecentProperty(userId!, recentId);
      return recent ?? properties[0] ?? null;
    }
  });
}

/** 같은 계정·대상의 모든 접근 구독은 하나의 현재 역할 조회를 공유합니다. */
export function useManagementContext(userId: string | undefined, propertyId: string, revalidateOnMount = true) {
  return useQuery({
    ...FRESH_ACCESS_QUERY_OPTIONS,
    refetchOnMount: revalidateOnMount ? 'always' : false,
    queryKey: ['property-access', userId, propertyId],
    enabled: Boolean(userId) && isPropertyId(propertyId),
    queryFn: ({ signal }) => getPropertyAccessContext(propertyId, signal)
  });
}

/** 최초 진입과 임시 주민 홈에서 실제 승인된 본인 참여만 공유합니다. */
export function useResidentProperties(userId: string | undefined, enabled = true) {
  return useQuery({
    ...FRESH_ACCESS_QUERY_OPTIONS,
    queryKey: ['resident-properties', userId],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) => getResidentProperties(signal),
    gcTime: 0
  });
}
