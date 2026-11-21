'use client';

import type {
  Dispatch,
  SetStateAction
} from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { QueryClient } from '@tanstack/react-query';
import type { AccountBalance } from '@/widgets/banking-workspace/api/bankingBalanceApiTypes';

import { useCallback } from 'react';
import { useSession } from '@/entities/session';
import { useRouter } from 'next/navigation';
import type { BalanceBuilding } from '../../../api/bankingBalanceApiTypes';
import type {
  Action,
  BalancePanel
} from '../../../model/balancePanelTypes';
interface UseBankingBalanceNavigationOptions {
  setAccountDetailId: Dispatch<SetStateAction<string | null>>;
  initialAccountId: string | null;
  setInitialAccountId: Dispatch<SetStateAction<string | null>>;
  params: ReadonlyURLSearchParams;
  router: ReturnType<typeof useRouter>;
  propertyId: string;
  cache: QueryClient;
  session: ReturnType<typeof useSession>;
  setAction: Dispatch<SetStateAction<Action | null>>;
  panel: BalancePanel | undefined;
  balanceListHref: string;
  setNotice: Dispatch<SetStateAction<{
    message: string;
    tone: 'success' | 'error';
  } | null>>;
  balanceQuery: URLSearchParams;
  setDetail: Dispatch<SetStateAction<string | null>>;
  selectedAccount: AccountBalance | undefined;
  search: string;
  filter: string;
  setHistoryAccountId: Dispatch<SetStateAction<string | null>>;
  setChartOpen: Dispatch<SetStateAction<boolean>>;
  setEditingAccountId: Dispatch<SetStateAction<string | null>>;
  month: string;
}

/** 통장 BalanceNavigation 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingBalanceNavigation({
  setAccountDetailId,
  initialAccountId,
  setInitialAccountId,
  params,
  router,
  propertyId,
  cache,
  session,
  setAction,
  panel,
  balanceListHref,
  setNotice,
  balanceQuery,
  setDetail,
  selectedAccount,
  search,
  filter,
  setHistoryAccountId,
  setChartOpen,
  setEditingAccountId,
  month
}: UseBankingBalanceNavigationOptions) {

  const closeInitial = useCallback(() => {
    setAccountDetailId(initialAccountId);
    setInitialAccountId(null);
    if (params.has('initial')) {
      const next = new URLSearchParams(params.toString());
      next.delete('initial');
      router.replace(`/manage/${propertyId}/banking/balances?${next}`, {
        scroll: false
      });
    }
  }, [setAccountDetailId, initialAccountId, setInitialAccountId, params, router, propertyId]);

  const saved = useCallback(async (message: string, keepOpen = false) => {
    await cache.invalidateQueries({
      queryKey: ['banking-balances', session.data?.id, propertyId]
    });
    if (!keepOpen)
      setAction(null);
    if (panel && !keepOpen) {
      router.replace(balanceListHref);

      return;
    }
    setNotice({
      message,
      tone: 'success'
    });
  }, [cache, session, propertyId, setAction, panel, router, balanceListHref, setNotice]);

  const openDetail = useCallback((b: BalanceBuilding) => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/banking/balances/${b.id}?${balanceQuery}`);

      return;
    }
    setDetail(b.id);
  }, [router, propertyId, balanceQuery, setDetail]);

  const openPanel = useCallback((kind: BalancePanel, id?: string) => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const queryParams = new URLSearchParams(balanceQuery);
      if (selectedAccount)
        queryParams.set('account', selectedAccount.id);
      if (id)
        queryParams.set('target', id);
      if (kind === 'chart') {
        queryParams.set('search', search);
        queryParams.set('filter', filter);
      }
      router.push(`/manage/${propertyId}/banking/balances/details/${kind}?${queryParams}`);

      return;
    }
    if (kind === 'initial')
      setAccountDetailId(null);
    if (kind === 'initial') {
      setInitialAccountId(id ?? null);

      return;
    }
    if (kind === 'history') {
      setHistoryAccountId(id ?? null);

      return;
    }
    if (kind === 'account') {
      setAccountDetailId(id ?? null);

      return;
    }
    if (kind === 'chart') {
      setChartOpen(true);

      return;
    }
    setAction({
      kind,
      id
    });
  }, [balanceQuery, selectedAccount, search, filter, router, propertyId, setAccountDetailId, setInitialAccountId, setHistoryAccountId, setChartOpen, setAction]);

  /** 모바일에서는 계좌 설정 경로로 이동하고 PC에서는 기존 상세 위의 편집창을 엽니다. */
  const editAccount = useCallback((id: string) => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/settings/accounts?edit=${encodeURIComponent(id)}`);

      return;
    }
    setEditingAccountId(id);
  }, [router, propertyId, setEditingAccountId]);

  const openAccountTransactions = useCallback((id: string) => {
    router.push(`/manage/${propertyId}/banking/transactions?${new URLSearchParams({
      month,
      account: id
    })}`);
  }, [router, propertyId, month]);

  const closeAccountEditor = useCallback(() => setEditingAccountId(null), [setEditingAccountId]);

  const accountEdited = useCallback(() => {
    setEditingAccountId(null);
    setNotice({
      message: '통장 정보를 수정했어요.',
      tone: 'success'
    });
  }, [setEditingAccountId, setNotice]);

  return {
    editAccount,
    openAccountTransactions,
    closeAccountEditor,
    accountEdited,
    closeInitial,
    saved,
    openDetail,
    openPanel
  };
}
