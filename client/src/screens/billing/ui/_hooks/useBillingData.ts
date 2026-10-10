import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  getBillingSettings,
  getBillingMonth,
  getBillingHistory
} from '@/features/billing-management';

/** 계정·관리대상·조회 조건을 캐시 키에 포함하고 장애를 빈 청구나 예시 데이터로 대체하지 않습니다. */
function useBillingQuery<T>(propertyId: string, kind: string, queryFn: () => Promise<T>, refreshWithTime = false) {
  const session = useSession();
  return useQuery({
    queryKey: ['billing', session.data?.id, propertyId, kind],
    queryFn,
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    // 월이 바뀌거나 화면으로 돌아오면 서버 기준월을 갱신해 이전 달 기한·적용월을 계속 표시하지 않습니다.
    refetchInterval: refreshWithTime ? 60_000 : false,
    refetchOnWindowFocus: refreshWithTime
  });
}
export function useBillingSettings(propertyId: string) {
  return useBillingQuery(propertyId, 'settings', () => getBillingSettings(propertyId), true);
}
export function useBillingMonth(propertyId: string, month: string, unitId?: string) {
  return useBillingQuery(propertyId, `month:${month}:${unitId ?? ''}`, () => getBillingMonth(propertyId, month, unitId));
}
export function useBillingHistory(propertyId: string) {
  return useBillingQuery(propertyId, 'history', () => getBillingHistory(propertyId));
}
