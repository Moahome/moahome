'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { getBankingWorkspace } from '../../../api/bankingApi';
/** 조회가 준비된 다음 입력·편집 화면을 마운트해 훅 호출 순서를 고정합니다. */
export function useBankingWorkspaceQuery(propertyId: string) {
  const session = useSession();

  const workspace = useQuery({
    queryKey: ['banking-workspace', session.data?.id, propertyId],
    queryFn: ({
      signal
    }) => getBankingWorkspace(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });

  return workspace;
}
