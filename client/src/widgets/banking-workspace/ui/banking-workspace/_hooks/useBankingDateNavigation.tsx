'use client';

import type {
  Dispatch,
  SetStateAction
} from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { BankingWorkspaceData } from '../../../api/bankingApiTypes';

import { useCallback } from 'react';
import {
  getMonthDateRange,
  setDateRangeQuery,
  type DateRange
} from '@/shared/lib/date-range';
import { useRouter } from 'next/navigation';
import { getAccountsForRange } from '../../../model/bankAccountVisibility';
interface UseBankingDateNavigationOptions {
  setSelection: Dispatch<SetStateAction<{
    scope: string;
    ids: string[];
  } | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  searchParams: ReadonlyURLSearchParams;
  data: BankingWorkspaceData;
  accountId: string;
  setAccountId: Dispatch<SetStateAction<string>>;
  router: ReturnType<typeof useRouter>;
  propertyId: string;
  view: 'transactions' | 'expenses' | 'upload';
}

/** 통장 DateNavigation 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingDateNavigation({
  setSelection,
  setPage,
  searchParams,
  data,
  accountId,
  setAccountId,
  router,
  propertyId,
  view
}: UseBankingDateNavigationOptions) {

  const changeDateRange = useCallback((value: DateRange) => {
    setSelection(null);
    setPage(1);
    const next = new URLSearchParams(searchParams.toString());
    setDateRangeQuery(next, value);
    const nextAccount = getAccountsForRange(data?.accounts ?? [], value).some((account) => account.id === accountId) ? accountId : 'ALL';
    setAccountId(nextAccount);
    if (nextAccount === 'ALL')
      next.delete('account');
    else
      next.set('account', nextAccount);
    next.delete('imported');
    router.replace(`/manage/${propertyId}/banking/${view}?${next}`, {
      scroll: false
    });
  }, [setSelection, setPage, searchParams, data, accountId, setAccountId, router, propertyId, view]);

  const changeMonth = useCallback((value: string) => {
    setSelection(null);
    setPage(1);
    if (!['transactions', 'expenses'].includes(view))
      return;
    const query = new URLSearchParams(searchParams.toString());
    query.delete('startDate');
    query.delete('endDate');
    query.set('month', value);
    const nextAccount = getAccountsForRange(data?.accounts ?? [], getMonthDateRange(value)).some((account) => account.id === accountId) ? accountId : 'ALL';
    setAccountId(nextAccount);
    if (nextAccount === 'ALL')
      query.delete('account');
    else
      query.set('account', nextAccount);
    query.delete('imported');
    router.replace(`/manage/${propertyId}/banking/${view}?${query}`, {
      scroll: false
    });
  }, [setSelection, setPage, view, searchParams, data, accountId, setAccountId, router, propertyId]);

  return {
    changeDateRange,
    changeMonth
  };
}
