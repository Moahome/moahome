'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { Toast } from '@/shared/ui/toast';
import { BankAccountEditor } from '../_components/bank-account-editor/bankAccountEditor';

/** 직접 접근·새로고침에서도 현재 관리자 권한을 확인하고 PC와 같은 계좌 조회·편집을 페이지로 제공합니다. */
export function BankAccountPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const [saved, setSaved] = useState(false);

  if (context.data?.role !== 'ADMIN') return (
    <p
      role={'alert'}
    >
      관리소장만 계좌를 관리할 수 있어요.
    </p>
  );

  return (
    <>
      <BankAccountEditor
        propertyId={propertyId}
        presentation={'page'}
        onClose={() => router.replace(`/manage/${propertyId}/settings`)}
        onSaved={() => setSaved(true)}
      />
      {saved && (
        <Toast
          message={'계좌 정보를 변경했어요.'}
          onClose={() => setSaved(false)}
        />
      )}
    </>
  );
}
