'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Toast } from '@/shared/ui/toast';
import { BankAccountEditor } from '../_components/bank-account-editor/bankAccountEditor';

/** 직접 접근·새로고침에서도 현재 관리자 권한을 확인하고 PC와 같은 계좌 조회·편집을 페이지로 제공합니다. */
export function BankAccountPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);


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
