'use client';

import {
  TransferAllocationEditor,
  type TransferAllocationPart
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { getTodayDate } from '@/shared/lib/date-range';
import { useQuery } from '@tanstack/react-query';
import { getBankingBalances } from '../../../api/bankingBalanceApi';
import { getTransferLimits } from '../../../model/transferBalance';

/** 출금 통장이 바뀌면 소속 동의 한도도 새로 조회하고, 조회 실패·미설정을 유효한 0원으로 추정하지 않습니다. */
export function TransferAllocation({ propertyId, outgoingAccountId, date, total, buildings, value, onChange, disabled = false }: {
  propertyId: string; outgoingAccountId: string; date: string; total: string;
  buildings: readonly { id: string; label: string }[];
  value: readonly TransferAllocationPart[]; onChange: (value: TransferAllocationPart[]) => void; disabled?: boolean;
}) {
  const session = useSession();
  const month = getTodayDate().slice(0, 7);
  const startMonth = date.slice(0, 7);
  const funds = useQuery({
    queryKey: ['banking-balances', session.data?.id, propertyId, 'transfer', outgoingAccountId, startMonth, month],
    queryFn: ({ signal }) => getBankingBalances(propertyId, month, outgoingAccountId, signal, startMonth),
    enabled: Boolean(session.data && outgoingAccountId) && !disabled,
    retry: false,
    gcTime: 0,
    staleTime: 0
  });
  return (
    <>
      {funds.isFetching && (
        <p
          role={'status'}
        >
          동별 보유금을 확인하고 있어요.
        </p>
      )}
      {funds.isError && (
        <p
          role={'alert'}
        >
          동별 보유금을 불러오지 못했어요.
          <Button
            variant={'text'}
            onClick={() => { void funds.refetch(); }}
          >
            다시 시도
          </Button>
        </p>
      )}
      <TransferAllocationEditor
        total={total}
        buildings={buildings}
        value={value}
        onChange={onChange}
        disabled={disabled}
        limits={disabled ? undefined : getTransferLimits(funds.isError || funds.isFetching ? undefined : funds.data, outgoingAccountId, date)}
      />
    </>
  );
}
