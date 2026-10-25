
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { subscribePropertyForbidden } from '@/entities/session';
import {
  getManagementDashboardPath,
  isPropertyId
} from '@/entities/property';
import {
  ApiError,
  isRequestCanceled
} from '@/shared/api';
import { clearPropertyQueries } from './clearPropertyQueries';
import { useManagementContext } from './useManagementAccess';
import {
  forgetRecentProperty,
  rememberRecentProperty
} from './recentProperty';
import type { PropertyAccessGuardOptions } from './propertyAccessTypes';

/** 진입별 서버 확인과 업무 403 재확인을 공유하며 동일 화면의 재조회는 기존 작업을 유지합니다. */
export function usePropertyAccessGuard({ userId, propertyId, routeKey, area }: PropertyAccessGuardOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useManagementContext(userId, propertyId, false);
  const { refetch } = access;
  const identity = `${userId}:${propertyId}:${routeKey}`;
  const [verified, setVerified] = useState('');
  const [blocked, setBlocked] = useState('');
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);

  const revalidate = useCallback(async () => {
    const current = generation.current;
    const result = await refetch({
      cancelRefetch: false
    });
    if (current !== generation.current) return;
    const error = result.error;
    if (isRequestCanceled(error)) return;
    if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) {
      setBlocked(identity);
      router.replace('/login');
      return;
    }
    const denied = error instanceof ApiError && error.code === 'ACCESS_DENIED';
    // 일시 장애는 이전의 검증 결과와 화면을 보존하며 오류 안내에서 같은 조회만 재시도합니다.
    if (error && !denied) return;
    const property = result.data;
    const management = property?.role === 'ADMIN' || property?.role === 'MANAGER';
    const eligible = area === 'management' ? management : property?.role === 'RESIDENT' && property.residentEligible;
    if (!denied && eligible) {
      if (management) rememberRecentProperty(userId!, propertyId);
      setBlocked('');
      setVerified(identity);
      return;
    }
    setBlocked(identity);
    forgetRecentProperty(userId!, propertyId);
    // 접근 상실 시 이전 계정·대상 조회만 중단합니다. Mutation 취소나 서버 롤백을 요청하지 않습니다.
    await clearPropertyQueries(queryClient, userId!, propertyId);
    if (current !== generation.current) return;
    if (denied) router.replace('/start');
    else if (area === 'resident' && management) router.replace(getManagementDashboardPath(propertyId));
    else if (area === 'management' && property?.residentEligible) router.replace(`/resident?propertyId=${propertyId}`);
    // RESIDENT지만 실제 연결이 없으면 현재 위치에서 연결 확인을 안내합니다.
  }, [refetch, identity, area, propertyId, queryClient, router, userId]);

  useEffect(() => {
    const current = ++generation.current;
    // 라우터 변경의 커밋 후 조회를 시작하고 이미 떠난 경계의 예약 작업은 실행하지 않습니다.
    queueMicrotask(() => {
      if (current === generation.current && userId && isPropertyId(propertyId)) void revalidate();
    });
    return () => { if (generation.current === current) generation.current = current + 1; };
  }, [userId, propertyId, revalidate]);

  useEffect(() => subscribePropertyForbidden((target) => {
    if (target !== propertyId || !userId || pending.current) return;
    pending.current = revalidate().finally(() => { pending.current = null; });
  }), [propertyId, userId, revalidate]);

  return {
    ...access,
    ready: verified === identity && blocked !== identity,
    blocked: blocked === identity,
    revalidate
  };
}
