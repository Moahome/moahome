'use client';

import { useState } from 'react';
import {
  ManualReceiptForm,
  type ManualReceiptValues
} from '@/entities/banking';
import { getManualReceiptUnits } from '../../model/paymentPreview';
import { usePaymentWorkspace } from '../payment-workspace-provider/paymentWorkspaceProvider';

/** 저장 경로와 원장은 widget이 소유하고 기존 입금 입력은 초기 설정과 같은 공통 폼으로 표시합니다. */
export function ManualPayment({ unitId = '', presentation = 'modal', onClose, onCreated }: {
  presentation?: 'modal' | 'page'; unitId?: string; onClose: () => void; onCreated: (id: string, date: string) => void;
}) {
  const { ledger, update, busy } = usePaymentWorkspace();
  const [requestId] = useState(() => crypto.randomUUID());
  async function submit(values: ManualReceiptValues) {
    const failure = await update({
      type: 'manual',
      data: {
        id: requestId,
        purpose: values.purpose,
        accountId: values.accountId,
        date: values.date,
        amount: values.amount,
        payer: values.payer,
        ...(values.purpose === 'HOUSEHOLD' ? {
          unitId: values.unitId
        } : {
          category: values.category,
          note: values.note
        }),
        ...(values.incomeAllocation ? {
          incomeAllocation: values.incomeAllocation
        } : {})
      }
    }, values.purpose === 'HOUSEHOLD' ? '수동 입금을 등록했어요.' : '입금을 등록했어요.');
    if (!failure) onCreated(requestId, values.date);
    return failure;
  }
  return (
    <ManualReceiptForm
      accounts={ledger.accounts.filter((account) => !account.status || account.status === 'ACTIVE')}
      units={getManualReceiptUnits(ledger)}
      buildings={ledger.buildings ?? []}
      asOf={ledger.asOf}
      unitId={unitId}
      presentation={presentation}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}
