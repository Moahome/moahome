'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { getRegistrationOptions } from '../api/residentRegistrationApi';

/** 등록·가입 요청·출력에서 같은 세대 응답의 동 유무를 사용하고 표시 문자열로 동 유무를 추정하지 않습니다. */
export function useResidentUnitOptions(propertyId: string) {
  const session = useSession();

  return useQuery({
    queryKey: ['resident-registration-units', session.data?.id, propertyId],
    queryFn: ({
      signal
    }) => getRegistrationOptions(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
}
