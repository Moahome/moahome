'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  discardRegistrationDraft,
  MANAGER_PREVIEW_STORAGE_KEY
} from '../../model/registrationDraft';
import {
  discardRegistrationReceipt,
  discardSubmissionBody
} from '../../model/registrationSubmission';

/** 전체 문서 이동에서도 등록 흐름 밖의 입력을 폐기하며 미확인 요청 ID는 재로그인 결과 조회를 위해 유지합니다. */
export function RegistrationDraftLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    const step = new URLSearchParams(window.location.search).get('registration');
    if (['/start', '/properties/add'].includes(pathname) && step && ['basic', 'units', 'administrator', 'account', 'fees', 'review', 'complete'].includes(step)) return;
    discardRegistrationDraft();
    discardRegistrationDraft(MANAGER_PREVIEW_STORAGE_KEY);
    discardSubmissionBody();
    discardRegistrationReceipt();
  }, [pathname]);

  return null;
}
