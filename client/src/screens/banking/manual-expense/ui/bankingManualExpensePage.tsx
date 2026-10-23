'use client';

import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { ManualExpense } from '@/widgets/banking-workspace';

/** 직접 접근에도 등록할 수 있고 저장 후 출금일·통장을 선택한 통장 거래 목록으로 복귀합니다. */
export function BankingManualExpensePage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAccountId = searchParams.get('account') ?? undefined;

  return (
    <ManualExpense
      propertyId={propertyId}
      presentation={'page'}
      initialAccountId={initialAccountId}
      onClose={() => router.replace(`/manage/${propertyId}/banking/transactions`)}
      onCreated={(_id, date, accountId) => {
        const query = new URLSearchParams({
          month: date.slice(0, 7),
          account: accountId,
          registered: '1'
        });
        router.replace(`/manage/${propertyId}/banking/transactions?${query}`);
      }}
    />
  );
}
