'use client';

import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';
import {
  ManualExpenseForm,
  getBankAccountLabel,
  type ManualTransferSeed,
  type ManualExpenseValues
} from '@/entities/banking';
import { PayableManager } from '@/features/payable-management';
import { useRouter } from 'next/navigation';
import { ManualBankTransfer } from '@/features/manual-bank-transfer';
import { useSession } from '@/entities/session';
import { LoadingState } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useRef,
  useState
} from 'react';
import {
  bankingError,
  createManualExpense,
  getBankingWorkspace
} from '../../api/bankingApi';

/** 기존 지출 모달을 표시하고 운영 화면의 API·캐시 갱신은 이 widget에서 처리합니다. */
export function ManualExpense({ propertyId, initialAccountId, presentation = 'modal', onClose, onCreated }: {
  propertyId: string; initialAccountId?: string; presentation?: 'modal' | 'page'; onClose: () => void; onCreated: (id: string, date: string, accountId: string, transfer?: boolean) => void;
}) {
  const router = useRouter();
  const [payableMode, setPayableMode] = useState(false);
  const [createdPayable, setCreatedPayable] = useState<string | null>(null);
  const session = useSession();
  const propertyScope = capturePropertyQueryScope(session.data?.id, propertyId);
  const cache = useQueryClient();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const workspace = useQuery({
    queryKey,
    queryFn: ({ signal }) => getBankingWorkspace(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false
  });
  const [transferSeed, setTransferSeed] = useState<ManualTransferSeed | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  async function submit(values: ManualExpenseValues) {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true);
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await createManualExpense(propertyId, {
        id: requestId,
        ...values
      });
      setPropertyQueryData(cache, queryKey, saved, propertyScope);
      void cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
      onCreated(requestId, values.date, values.accountId);
      return null;
    } catch (error) { return bankingError(error); }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (workspace.isPending) return (
    <LoadingState
      title={'지출 등록 정보를 불러오고 있어요.'}
    />
  );
  if (!workspace.data) return (
    <RequestError
      error={workspace.error}
      onRetry={() => void workspace.refetch({
        cancelRefetch: false
      })}
    />
  );
  if (createdPayable) return (
    <PayableManager
      propertyId={propertyId}
      payableId={createdPayable}
      presentation={presentation}
      onClose={onClose}
    />
  );
  return (
    <ManualExpenseForm
      onPayable={(enabled) => { setPayableMode(enabled); if (enabled) setTransferSeed(null); }}
      renderPayable={payableMode ? (selector) => (
        <PayableManager
          propertyId={propertyId}
          presentation={'embedded'}
          onClose={onClose}
          onBusyChange={setBusy}
          onCreated={(id) => { if (presentation === 'page') router.replace(`/manage/${propertyId}/accounting/payables/${id}`); else setCreatedPayable(id); }}
        >
          {selector}
        </PayableManager>
      ) : undefined}
      onTransfer={setTransferSeed}
      renderTransfer={transferSeed ? (selector) => (
        <ManualBankTransfer
          propertyId={propertyId}
          accounts={(workspace.data.accounts ?? []).filter((account) => account.status === 'ACTIVE').map((account) => ({
            id: account.id,
            label: getBankAccountLabel(account)
          }))}
          buildings={workspace.data.buildings}
          asOf={workspace.data.asOf}
          seed={transferSeed}
          onClose={onClose}
          onBusyChange={setBusy}
          onCreated={(id, date, from) => onCreated(id, date, from, true)}
        >
          {selector}
        </ManualBankTransfer>
      ) : undefined}
      accounts={workspace.data.accounts ?? []}
      expenseAccounts={workspace.data.expenseAccounts}
      buildings={workspace.data.buildings}
      asOf={workspace.data.asOf}
      initialAccountId={initialAccountId}
      presentation={presentation}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}
