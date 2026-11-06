'use client';

import {
  capturePropertyQueryScope,
  setPropertyQueryData
} from '@/entities/property';
import {
  ManualExpenseForm,
  type ManualExpenseValues
} from '@/entities/banking';
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
  propertyId: string; initialAccountId?: string; presentation?: 'modal' | 'page'; onClose: () => void; onCreated: (id: string, date: string, accountId: string) => void;
}) {
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
  return (
    <ManualExpenseForm
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
