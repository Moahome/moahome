'use client';

import type { FormEvent } from 'react';
import { ApiError } from '@/shared/api';
import {
  balanceError,
  saveBankInitialBalance
} from '../../../../../api/bankingBalanceApi';
import { useSession } from '@/entities/session';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import {
  getBankingBalances,
  getBankBillingImpact
} from '../../../../../api/bankingBalanceApi';
import type {
  AccountBalance,
  BalanceWorkspace
} from '../../../../../api/bankingBalanceApiTypes';
import { getOpeningBalances } from '@/features/billing-management';

/** BankInitialBalanceEditor의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBankInitialBalanceEditor({
  propertyId,
  account,
  data,
  onClose,
  onSaved,
  presentation = 'modal'
}: {
  propertyId: string;
  account: AccountBalance;
  data: BalanceWorkspace;
  onClose: () => void;
  onSaved: () => Promise<void>;
  presentation?: 'modal' | 'page';
}) {

  const session = useSession();
  const cache = useQueryClient();
  const formId = useId();
  // 편집 중 부모 조회가 갱신돼도 제출 기준 버전과 입력 당시 원본을 바꾸지 않습니다.
  const [original] = useState(account);
  const [date, setDate] = useState(original.openingDate ?? '');
  const [amount, setAmount] = useState(original.openingBalance ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(false);
  const request = useRef<{ body: string;
id: string } | null>(null);
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);
  const allowed = data.initialCorrectionAllowed === true && account.status === 'ACTIVE';
  const dateChanged = date !== (original.openingDate ?? '');
  const [confirmedToken, setConfirmedToken] = useState('');
  const [buildingAmounts, setBuildingAmounts] = useState<Record<string, string>>({});
  const impact = useQuery({
    queryKey: ['bank-initial-billing-impact', session.data?.id, propertyId, account.id, date],
    queryFn: ({
      signal
    }) => getBankBillingImpact(propertyId, account.id, date, signal),
    enabled: allowed && dateChanged && /^\d{4}-\d{2}-\d{2}$/.test(date),
    retry: false,
    staleTime: 0
  });
  const cash = useQuery({
    queryKey: ['bank-initial-building-balances', session.data?.id, propertyId, account.id, data.month],
    queryFn: ({
      signal
    }) => getBankingBalances(propertyId, data.month, account.id, signal),
    enabled: data.buildings.length > 0,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const affectedBuildings = cash.data?.buildings.filter((row) => row.openingBalance != null) ?? [];
  const buildingAmountsValid = affectedBuildings.every((row) => /^-?[0-9]{1,15}$/.test(buildingAmounts[row.id] ?? row.openingBalance!));
  const buildingTotal = buildingAmountsValid
    ? affectedBuildings.reduce((sum, row) => sum + BigInt(buildingAmounts[row.id] ?? row.openingBalance!), BigInt(0)) : null;
  const needsConfirmation = Boolean(impact.data?.changed || impact.data?.missingMonths.length);
  const bankAmount = /^[0-9]{1,15}$/.test(amount) ? BigInt(amount) : null;
  const buildingRemaining = bankAmount !== null && buildingTotal !== null ? bankAmount - buildingTotal : null;
  const buildingTotalExceeded = buildingRemaining !== null && buildingRemaining < BigInt(0);
  const impactReady = (!data.buildings.length || (cash.isSuccess && !cash.isFetching)) && buildingAmountsValid && !buildingTotalExceeded
    && (!dateChanged || (impact.isSuccess && !impact.isFetching && !impact.data.blockedReason
      && (!needsConfirmation || confirmedToken === impact.data.token)));

  /** 기준 잔액과 동별 금액을 검증하고 동일 요청 ID로 저장·재시도합니다. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !allowed || !impactReady)
      return;
    if (!date || !/^[0-9]{1,15}$/.test(amount) || !reason.trim() || [...reason.trim()].length > 500) {
      setError('초기 기준일, 시작 잔액과 정정 사유를 확인해주세요.');

      return;
    }
    const body = JSON.stringify({
      date,
      amount,
      reason: reason.trim(),
      billingToken: dateChanged ? impact.data?.token : undefined,
      confirmBilling: dateChanged && needsConfirmation && confirmedToken === impact.data?.token,
      buildings: affectedBuildings.map((row) => ({
        buildingId: row.id,
        revision: row.openingRevision ?? 0,
        amount: buildingAmounts[row.id] ?? row.openingBalance!
      }))
    });
    if (request.current?.body !== body)
      request.current = {
        body,
        id: crypto.randomUUID()
      };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await saveBankInitialBalance(propertyId, {
        id: request.current.id,
        accountId: account.id,
        cutoffDate: date,
        amount,
        revision: original.openingRevision ?? 0,
        reason: reason.trim(),
        billingToken: dateChanged ? impact.data?.token : undefined,
        confirmBilling: dateChanged && needsConfirmation && confirmedToken === impact.data?.token,
        ...(affectedBuildings.length ? {
          buildings: affectedBuildings.map((row) => ({
            buildingId: row.id,
            revision: row.openingRevision ?? 0,
            amount: buildingAmounts[row.id] ?? row.openingBalance!
          }))
        } : {})
      });
      if (!active.current)
        return;
      await cache.invalidateQueries({
        predicate: (query) => query.queryKey[1] === session.data?.id && query.queryKey[2] === propertyId
      });
      if (active.current)
        await onSaved();
    } catch (failure) {
      if (active.current)
        setError(balanceError(failure));
      if (failure instanceof ApiError && failure.code === 'INITIAL_BILLING_CONFIRMATION_REQUIRED') {
        setConfirmedToken('');
        await impact.refetch();
      }
    } finally {
      pending.current = false;
      if (active.current)
        setBusy(false);
    }
  }

  return {
    kind: 'ready' as const,
    submit,
    propertyId,
    account,
    data,
    onClose,
    onSaved,
    presentation,
    session,
    cache,
    formId,
    original,
    date,
    setDate,
    amount,
    setAmount,
    reason,
    setReason,
    error,
    setError,
    busy,
    setBusy,
    pending,
    active,
    request,
    allowed,
    dateChanged,
    confirmedToken,
    setConfirmedToken,
    buildingAmounts,
    setBuildingAmounts,
    impact,
    cash,
    affectedBuildings,
    buildingTotal,
    needsConfirmation,
    bankAmount,
    buildingTotalExceeded,
    impactReady
  };
}

/** BankAccountHistory의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBankAccountHistory({
  propertyId,
  accountId,
  onClose,
  presentation = 'modal'
}: {
  propertyId: string;
  accountId: string;
  onClose: () => void;
  presentation?: 'modal' | 'page';
}) {

  const session = useSession();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['bank-account-corrections', session.data?.id, propertyId, accountId],
    queryFn: ({
      signal
    }) => getOpeningBalances(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
  // 같은 동 이름이 여러 통장에 있어도 저장 당시 통장 ID가 일치하는 기록만 조회합니다.
  const changes = (query.data?.corrections ?? []).filter((change) => change.bankAccountId === accountId
    || change.details.some((part) => part.targetId === accountId))
    .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  const pageCount = Math.max(1, Math.ceil(changes.length / 5));
  const currentPage = Math.min(page, pageCount);

  return {
    kind: 'ready' as const,
    accountId,
    onClose,
    presentation,
    page,
    setPage,
    query,
    changes,
    pageCount,
    currentPage
  };
}