'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { Toast } from '@/shared/ui/toast';
import type { PreviewLedger } from '../../model/paymentPreview';
import {
  getPaymentLedger,
  mutatePayment,
  paymentError,
  type PaymentCommand
} from '../../api/paymentApi';

interface PaymentWorkspaceContextValue {
  ledger: PreviewLedger;
  propertyId: string;
  month: string;
  setMonth: (month: string) => void;
  busy: boolean;
  update: (command: PaymentCommand, message: string, onSaved?: (ledger: PreviewLedger) => void) => Promise<string | null>;
}
const PaymentWorkspaceContext = createContext<PaymentWorkspaceContextValue | null>(null);

/** 계정·관리대상별 실제 원장을 조회하고 조회 장애를 예시 데이터나 빈 수납으로 대체하지 않습니다. */
export function PaymentWorkspaceProvider({ propertyId, children }: { propertyId: string; children: ReactNode }) {
  const session = useSession();
  const cache = useQueryClient();
  const key = ['payment-workspace', session.data?.id, propertyId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getPaymentLedger(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true
  });
  const [selectedMonth, setMonth] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);

  /** 중복 클릭을 동기적으로 차단하고 서버 응답으로만 교체하며 실패 시 입력과 기존 원장을 유지합니다. */
  async function update(command: PaymentCommand, message: string, onSaved?: (ledger: PreviewLedger) => void): Promise<string | null> {
    if (busyRef.current) return '입금을 처리하고 있어요. 잠시 기다려주세요.';
    busyRef.current = true; setBusy(true);
    await cache.cancelQueries({
      queryKey: key
    });
    try {
      const saved = await mutatePayment(propertyId, command);
      cache.setQueryData(key, saved);
      onSaved?.(saved);
      void cache.invalidateQueries({
        queryKey: ['billing', session.data?.id, propertyId]
      });
      setNotice({
        id: Date.now(),
        message
      });
      return null;
    } catch (error) {
      // 충돌 이후 최신 청구 잔액은 다시 읽되 폼의 초안은 그대로 보존합니다.
      void cache.invalidateQueries({
        queryKey: key
      });
      return paymentError(error);
    } finally { busyRef.current = false; setBusy(false); }
  }

  if (!session.data || query.isPending) return (
    <p
      role={'status'}
    >
      입금 정보를 불러오고 있어요.
    </p>
  );
  if (!query.data) return (
    <section
      aria-label={'입금 조회 오류'}
    >
      <h1>
        입금 관리
      </h1>
      <p
        role={'alert'}
      >
        {paymentError(query.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => { void query.refetch(); }}
      >
        다시 시도
      </Button>
    </section>
  );
  return (
    <PaymentWorkspaceContext.Provider
      value={{
        ledger: query.data,
        propertyId,
        month: selectedMonth ?? query.data.asOf.slice(0, 7),
        setMonth,
        update,
        busy
      }}
    >
      {children}
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
    </PaymentWorkspaceContext.Provider>
  );
}
export function usePaymentWorkspace() {
  const value = useContext(PaymentWorkspaceContext);
  if (!value) throw new Error('입금 관리 레이아웃이 필요합니다.');
  return value;
}
