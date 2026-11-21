'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { useSearchParams } from 'next/navigation';
import { getQueryMonthRange } from '@/shared/lib/month-range';
import { getBankingBalances } from '../../../api/bankingBalanceApi';
/** 조회가 준비된 다음 입력·편집 화면을 마운트해 훅 호출 순서를 고정합니다. */
export function useBankingBalancesQuery(propertyId: string) {
  const session = useSession();
  const params = useSearchParams();
  const range = getQueryMonthRange(params);
  const month = range.endMonth;
  const startMonth = range.startMonth;
  const accountId = params.get('account') ?? 'ALL';
  const query = useQuery({
    queryKey: ['banking-balances', session.data?.id, propertyId, month, accountId, startMonth],
    queryFn: ({
      signal
    }) => getBankingBalances(propertyId, month, accountId === 'ALL' ? undefined : accountId, signal, startMonth),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });

  return query;
}
