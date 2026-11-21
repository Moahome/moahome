'use client';

import { PANEL_TITLES } from '../../../../../constant/bankingOptions';

import { useSession } from '@/entities/session';
import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useState
} from 'react';
import { getBankingBalances } from '../../../../../api/bankingBalanceApi';
import type {
  OpeningDraftState,
  BalanceActionDialogProps
} from '../../../_types/balancePanelTypes';
import {
  useQueryClient,
  type QueryFilters
} from '@tanstack/react-query';
import {
  useEffect,
  useRef
} from 'react';
import {
  bankingError,
  deleteBankingTransactions
} from '../../../../../api/bankingApi';
import {
  assignCashIncome,
  balanceError,
  correctCashOpenings,
  decideExternalSettlement,
  saveCashOpenings,
  settleExternalExpense
} from '../../../../../api/bankingBalanceApi';
import { sortExpenseLabels } from '../../../../../model/expenseAllocation';

/** BalanceActionDialog의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBalanceActionDialog(props: BalanceActionDialogProps) {

  const session = useSession();
  const accounts = props.data.accounts ?? [];
  const [accountId, setAccountId] = useState(props.action.id ?? props.data.accountId ?? accounts[0]?.id ?? '');
  const [openingDrafts, setOpeningDrafts] = useState<Record<string, OpeningDraftState>>({});
  const rememberOpening = useCallback((draft: OpeningDraftState) => {
    setOpeningDrafts((current) => ({
      ...current,
      [accountId]: draft
    }));
  }, [accountId]);
  const scoped = props.action.kind === 'opening' && accounts.length > 0;
  const query = useQuery({
    queryKey: ['banking-balances', session.data?.id, props.propertyId, props.data.month, accountId, props.data.startMonth],
    queryFn: ({
      signal
    }) => getBankingBalances(props.propertyId, props.data.month, accountId, signal, props.data.startMonth),
    enabled: scoped && Boolean(accountId),
    retry: false,
    gcTime: 0
  });
  if (!scoped)
    return {
      kind: 'unscoped' as const,
      props
    };

  if (!query.data)
    return {
      kind: 'loading' as const,
      props,
      query,
      accounts,
      accountId,
      setAccountId
    };

  return {
    kind: 'ready' as const,
    props,
    openingDrafts,
    rememberOpening,
    query,
    accounts,
    accountId,
    setAccountId
  };
}

/** BalanceOperationsDialog의 상태·요청·이벤트 흐름을 관리하고 화면에 필요한 값과 행동을 반환합니다. */
export function useBalanceOperationsDialog({
  action,
  data,
  propertyId,
  onClose,
  onSaved,
  presentation = 'modal',
  openingSelector,
  openingAccountId,
  openingDraft: cachedOpening,
  onOpeningDraftChange
}: BalanceActionDialogProps) {

  const session = useSession();
  const cache = useQueryClient();
  const bankCutoff = data.accounts?.find((row) => row.id === openingAccountId)?.openingDate ?? '';
  const cutoff = bankCutoff || data.cutoffDate || data.legacyOpening?.cutoffDate || '';
  const [amounts, setAmounts] = useState<Record<string, string>>(() => cachedOpening?.amounts ?? {
    ...Object.fromEntries(data.legacyOpening?.buildings.map((row) => [row.buildingId, row.amount]) ?? []),
    ...Object.fromEntries(data.buildings.filter((row) => row.openingBalance != null).map((row) => [row.id, row.openingBalance!]))
  });
  const [editingOpening, setEditingOpening] = useState(cachedOpening?.editing ?? false);
  const [correctionReason, setCorrectionReason] = useState(cachedOpening?.reason ?? '');
  const [openingRevisions] = useState(() => cachedOpening?.revisions ?? Object.fromEntries(data.buildings.map((row) => [row.id, row.openingRevision ?? 0])));
  const [payment, setPayment] = useState('');
  const [building, setBuilding] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [decisionRequestId] = useState(() => crypto.randomUUID());
  const pending = useRef(false);
  const [requestId] = useState(() => cachedOpening?.requestId ?? crypto.randomUUID());
  // 통장을 바꾸는 동안 입력과 요청 ID를 보존해 돌아왔을 때도 같은 초안을 이어갑니다.
  useEffect(() => {
    if (!openingAccountId || !onOpeningDraftChange)
      return;
    onOpeningDraftChange({
      cutoff,
      amounts,
      editing: editingOpening,
      revisions: openingRevisions,
      requestId,
      reason: correctionReason
    });
  }, [openingAccountId, onOpeningDraftChange, cutoff, amounts, editingOpening, openingRevisions, requestId, correctionReason]);
  const missing = sortExpenseLabels(data.buildings.filter((b) => b.active && b.status === 'OPENING_REQUIRED'));
  const [openingBuilding, setOpeningBuilding] = useState(missing[0]?.id ?? '');
  const registeredOpenings = sortExpenseLabels(data.buildings.filter((row) => row.openingBalance != null));
  const openingTargets = editingOpening ? registeredOpenings : missing;
  const inputOpening = editingOpening || missing.length > 0;
  const openingOptions = inputOpening ? openingTargets : registeredOpenings;
  const selectedOpening = openingOptions.find((b) => b.id === openingBuilding) ?? openingOptions[0];
  const enteredCount = openingTargets.filter((b) => /^-?[0-9]{1,15}$/.test(amounts[b.id] ?? '')).length;
  const external = data.externals.find((e) => e.id === action.id);
  const income = data.incomes.find((i) => i.id === action.id);
  const options = data.incomes.filter((i) => ['OTHER', 'EXTERNAL'].includes(i.kind) && BigInt(i.available) > BigInt(0) && (!external?.accountId || i.accountId === external.accountId));
  const title = action.kind === 'opening'
    ? editingOpening ? '기준 잔고 수정' : missing.length ? '동별 시작 잔고 설정' : PANEL_TITLES.opening
    : PANEL_TITLES[action.kind];

  async function submit() {
    if (pending.current)
      return;
    setError('');
    if (action.kind === 'opening' && editingOpening && (!correctionReason.trim() || [...correctionReason.trim()].length > 500)) {
      setError('정정 사유를 500자 이내로 입력해주세요.');

      return;
    }
    if (action.kind === 'opening' && (!cutoff || openingTargets.some((b) => !/^-?[0-9]{1,15}$/.test(amounts[b.id] ?? '')))) {
      setError('기준일과 각 동의 시작 잔고를 입력해주세요.');
      const firstMissing = openingTargets.find((b) => !/^-?[0-9]{1,15}$/.test(amounts[b.id] ?? ''));
      if (firstMissing)
        setOpeningBuilding(firstMissing.id);

      return;
    }
    if (action.kind === 'settlement' && (!payment || !/^[0-9]{1,15}$/.test(amount) || BigInt(amount) <= BigInt(0))) {
      setError('연결할 기타 입금과 0원보다 큰 금액을 입력해주세요.');

      return;
    }
    if (action.kind === 'assignment' && !building) {
      setError('귀속 동을 선택해주세요.');

      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (action.kind === 'opening' && editingOpening) {
        await correctCashOpenings(propertyId, {
          id: requestId,
          reason: correctionReason.trim(),
          accountId: openingAccountId,
          cutoffDate: cutoff,
          buildings: openingTargets.map((row) => ({
            buildingId: row.id,
            amount: amounts[row.id],
            revision: openingRevisions[row.id]
          }))
        });
      }
      if (action.kind === 'opening' && !editingOpening) {
        await saveCashOpenings(propertyId, {
          accountId: openingAccountId,
          cutoffDate: cutoff,
          buildings: missing.map((row) => ({
            buildingId: row.id,
            amount: amounts[row.id]
          }))
        });
      }
      if (action.kind === 'settlement' && external)
        await settleExternalExpense(propertyId, {
          id: requestId,
          allocationId: external.id,
          paymentId: options.find((i) => i.id === payment)?.paymentId ?? payment,
          ...(options.find((i) => i.id === payment)?.kind === 'EXTERNAL' ? {
            incomeAllocationId: payment
          } : {}),
          amount
        });
      if (action.kind === 'assignment' && income)
        await assignCashIncome(propertyId, {
          paymentId: income.id,
          buildingId: building
        });
      await onSaved('저장했어요.');
    } catch (failure) {
      setError(balanceError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  /** 실제 입금이 없어도 정산에서 제외할 수 있고, 실패 시 같은 요청 ID로 재시도합니다. */
  async function changeSettlementTarget() {
    if (pending.current || !external)
      return;
    pending.current = true;
    setBusy(true);
    setDecisionBusy(true);
    setError('');
    try {
      await decideExternalSettlement(propertyId, {
        id: decisionRequestId,
        allocationId: external.id,
        excluded: !external.excluded,
        revision: external.decisionRevision ?? 0
      });
      await onSaved(external.excluded ? '정산 대상으로 복원했어요.' : '정산에서 제외했어요.');
    } catch (failure) {
      setError(balanceError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      setDecisionBusy(false);
    }
  }

  /** 외부 부담액만 지우지 않고 잘못 등록된 출금 전체를 기존 소프트 삭제로 제거해 동별 지출도 함께 재계산합니다. */
  async function deleteExternalTransaction() {
    if (pending.current || !external?.transactionId)
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    const relatedQueries: QueryFilters = {
      predicate: (query) => query.queryKey[1] === session.data?.id && query.queryKey[2] === propertyId
        && ['banking-workspace', 'payment-workspace', 'billing'].includes(String(query.queryKey[0]))
    };
    try {
      // 진행 중인 이전 조회가 삭제 후 캐시를 덮어쓰지 않게 하고, 성공 후 관련 화면을 다시 읽습니다.
      await cache.cancelQueries(relatedQueries);
      await deleteBankingTransactions(propertyId, [external.transactionId]);
      await cache.invalidateQueries(relatedQueries);
      await onSaved('잘못 등록된 거래를 삭제했어요.');
    } catch (failure) {
      setError(bankingError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if ((action.kind === 'settlement' && !external) || (action.kind === 'assignment' && !income))
    return {
      kind: 'missing' as const,
      onClose,
      presentation,
      title
    };
  if (action.kind === 'settlement' && deleting && external)
    return {
      kind: 'deleting' as const,
      onClose,
      presentation,
      amount,
      error,
      setError,
      busy,
      setDeleting,
      external,
      title,
      deleteExternalTransaction
    };

  return {
    kind: 'ready' as const,
    action,
    data,
    onClose,
    presentation,
    openingSelector,
    cutoff,
    amounts,
    setAmounts,
    editingOpening,
    setEditingOpening,
    correctionReason,
    setCorrectionReason,
    payment,
    setPayment,
    building,
    setBuilding,
    amount,
    setAmount,
    error,
    setError,
    busy,
    decisionBusy,
    setDeleting,
    pending,
    missing,
    setOpeningBuilding,
    registeredOpenings,
    openingTargets,
    inputOpening,
    openingOptions,
    selectedOpening,
    enteredCount,
    external,
    income,
    options,
    title,
    submit,
    changeSettlementTarget
  };
}