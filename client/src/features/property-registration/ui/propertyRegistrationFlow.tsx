'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import type {
  BasicInfo,
  BasicInfoDraft
} from '../model/basicInfo';
import {
  discardRegistrationDraft,
  restoreRegistrationDraft,
  saveRegistrationDraft,
  type RegistrationStep
} from '../model/registrationDraft';
import {
  discardRegistrationReceipt,
  discardSubmissionBody
} from '../model/registrationSubmission';
import { PropertyRegistrationDialog } from './propertyRegistrationDialog';
import { UnitSetup } from './_components/unit-setup/unitSetup';
import { BankAccountSetup } from './_components/bank-account-setup/bankAccountSetup';
import { getUnitSetupError } from '../model/unitSetup';
import { getBankAccountErrors } from '../model/bankAccount';
import { getFeeItemsError } from '../model/feeItems';
import { FeeItemsSetup } from './_components/fee-items-setup/feeItemsSetup';
import { RegistrationReview } from './_components/registration-review/registrationReview';
import { useRegistrationSubmission } from './_hooks/useRegistrationSubmission';
import styles from './propertyRegistrationFlow.module.css';

/** 하나의 초안을 공유하고 마지막 확인 화면에서만 전체 저장과 결과 복구를 시작합니다. */
export function PropertyRegistrationFlow({
  userId,
  step,
  onClose,
}: {
  userId: string;
  step: RegistrationStep;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => restoreRegistrationDraft(userId));
  const [inputMessage, setInputMessage] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const unitsValid = !getUnitSetupError(draft.basicInfo.hasBuildings === true, draft.buildings, draft.units);
  const accountValid = Object.keys(getBankAccountErrors(draft.bankAccount)).length === 0;
  const feesValid = !getFeeItemsError(draft.feeItems);

  /** 서버의 입력 오류는 초안을 보존하고 해당 입력 단계부터 순서대로 다시 확인하게 합니다. */
  const showInputError = useCallback((errorStep: RegistrationStep, message: string) => {
    setInputMessage(message);
    setDraft((previous) => ({
      ...previous,
      step: errorStep
    }));
    router.replace(`/start?registration=${errorStep}`, {
      scroll: false
    });
  }, [router]);
  const submission = useRegistrationSubmission(userId, showInputError);
  const locked = submission.status !== 'idle';
  let currentStep: RegistrationStep = 'basic';
  if (step !== 'basic' && draft.basicInfoValidated) currentStep = 'units';
  if (['account', 'fees', 'review'].includes(step) && draft.basicInfoValidated && unitsValid) currentStep = 'account';
  if (['fees', 'review'].includes(step) && currentStep === 'account' && accountValid) currentStep = 'fees';
  if (step === 'review' && currentStep === 'fees' && feesValid) currentStep = 'review';
  // 제출 이후에는 URL 뒤로가기도 수정으로 처리하지 않고 저장 결과부터 확인합니다.
  if (locked) currentStep = 'review';

  useEffect(() => () => {
    discardRegistrationDraft();
    discardSubmissionBody();
    discardRegistrationReceipt();
  }, []);

  useEffect(() => {
    if (submission.status === 'complete') {
      discardRegistrationDraft();
      return;
    }
    saveRegistrationDraft(userId, {
      ...draft,
      step: currentStep
    });
  }, [userId, draft, currentStep, submission.status]);

  useEffect(() => {
    if (step === currentStep) return;
    router.replace(`/start?registration=${currentStep}`, {
      scroll: false
    });
  }, [step, currentStep, router]);

  useEffect(() => {
    if (inputMessage) errorRef.current?.focus();
  }, [inputMessage, currentStep]);

  /** 기본 정보 변경은 기존 동·세대를 유지하고 서버 검증 상태만 해제합니다. */
  const updateBasicInfo = useCallback((changes: Partial<BasicInfoDraft>) => {
    setDraft((previous) => ({
      ...previous,
      basicInfo: {
        ...previous.basicInfo,
        ...changes
      },
      basicInfoValidated: false
    }));
  }, []);

  /** 기본 정보 검증이 성공하면 수정 진입 여부와 관계없이 다음 단계인 동·세대로 이동합니다. */
  function completeBasicInfo(basicInfo: BasicInfo) {
    setInputMessage('');
    const destination: RegistrationStep = 'units';
    setDraft((previous) => ({
      ...previous,
      basicInfo: {
        ...basicInfo,
        addressDetail: basicInfo.addressDetail ?? '',
        propertyType: basicInfo.propertyType ?? ''
      },
      step: destination,
      basicInfoValidated: true
    }));
    router.push(`/start?registration=${destination}`, {
      scroll: false
    });
  }

  /** 요약에서 수정 단계로 가도 입력을 유지하며 다음은 항상 다음 순서로 진행하고 제출 후에는 이동을 막습니다. */
  function navigateSetup(nextStep: RegistrationStep) {
    if (locked) return;
    setInputMessage('');
    setDraft((previous) => ({
      ...previous,
      step: nextStep
    }));
    router.push(`/start?registration=${nextStep}`, {
      scroll: false
    });
  }

  let content;
  if (currentStep === 'review') {
    content = (
      <RegistrationReview
        draft={draft}
        status={submission.status}
        result={submission.result}
        message={submission.message}
        canRetry={submission.canRetry}
        onEdit={navigateSetup}
        onPrevious={() => navigateSetup('fees')}
        onSubmit={() => submission.submit(draft)}
        onCheck={() => { void submission.check(); }}
        onRetry={submission.retry}
        onClose={onClose}
      />
    );
  } else if (currentStep === 'fees') {
    content = (
      <FeeItemsSetup
        propertyName={draft.basicInfo.name}
        items={draft.feeItems}
        onChange={(feeItems) => setDraft((previous) => ({
          ...previous,
          feeItems
        }))}
        onPrevious={() => navigateSetup('account')}
        onNext={() => navigateSetup('review')}
      />
    );
  } else if (currentStep === 'account') {
    content = (
      <BankAccountSetup
        propertyName={draft.basicInfo.name}
        account={draft.bankAccount}
        onChange={(bankAccount) => setDraft((previous) => ({
          ...previous,
          bankAccount
        }))}
        onPrevious={() => navigateSetup('units')}
        onNext={() => navigateSetup('fees')}
      />
    );
  } else if (currentStep === 'units') {
    content = (
      <UnitSetup
        basicInfo={draft.basicInfo}
        buildings={draft.buildings}
        units={draft.units}
        automaticUnitRule={draft.automaticUnitRule}
        onAutomaticRuleChange={(automaticUnitRule) => setDraft((previous) => ({
          ...previous,
          automaticUnitRule
        }))}
        onChange={(buildings, units) => setDraft((previous) => ({
          ...previous,
          buildings,
          units,
          step: 'units'
        }))}
        onPrevious={() => navigateSetup('basic')}
        onNext={() => navigateSetup('account')}
      />
    );
  } else {
    content = (
      <PropertyRegistrationDialog
        draft={draft.basicInfo}
        onChange={updateBasicInfo}
        onValidated={completeBasicInfo}
        onClose={onClose}
        serverMessage={inputMessage}
      />
    );
  }

  return (
    <>
      {inputMessage && currentStep !== 'review' && currentStep !== 'basic' && (
        <p
          className={styles.error}
          role={'alert'}
          ref={errorRef}
          tabIndex={-1}
        >
          {inputMessage}
        </p>
      )}
      {content}
    </>
  );
}
