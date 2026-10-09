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
import { RegistrationComplete } from './_components/registration-complete/registrationComplete';
import { SubmissionDialog } from './_components/submission-dialog/submissionDialog';
import { useRegistrationSubmission } from './_hooks/useRegistrationSubmission';
import styles from './propertyRegistrationFlow.module.css';

/** 하나의 초안을 공유하고 마지막 확인 화면에서만 전체 저장과 결과 복구를 시작합니다. */
export function PropertyRegistrationFlow({
  userId,
  step,
  onClose,
  onDashboard,
}: {
  userId: string;
  step: RegistrationStep | 'complete';
  onClose: () => void;
  onDashboard: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => restoreRegistrationDraft(userId));
  const [inputMessage, setInputMessage] = useState('');
  const [showRegisteredDetails, setShowRegisteredDetails] = useState(false);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(true);
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
  let currentStep: RegistrationStep | 'complete' = 'basic';
  if (step !== 'basic' && draft.basicInfoValidated) currentStep = 'units';
  if (['account', 'fees', 'review'].includes(step) && draft.basicInfoValidated && unitsValid) currentStep = 'account';
  if (['fees', 'review'].includes(step) && currentStep === 'account' && accountValid) currentStep = 'fees';
  if (step === 'review' && currentStep === 'fees' && feesValid) currentStep = 'review';
  // 제출 이후에는 URL 뒤로가기도 수정으로 처리하지 않고 저장 결과부터 확인합니다.
  if (locked) currentStep = 'review';
  // 저장 성공 뒤에는 이전 단계 이력도 완료 화면으로 치환해 같은 등록을 다시 제출하지 않습니다.
  if (submission.status === 'complete' && submission.result) currentStep = 'complete';

  useEffect(() => () => {
    discardRegistrationDraft();
    discardSubmissionBody();
    discardRegistrationReceipt();
  }, []);

  useEffect(() => {
    if (currentStep === 'complete') {
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

  /** 닫았던 안내도 사용자가 결과 확인·재시도를 선택하면 다시 열며 동일 요청의 복구 처리를 사용합니다. */
  function checkRegistrationResult() {
    setSubmissionDialogOpen(true);
    void submission.check();
  }

  /** 결과가 없는 것을 확인한 요청에 한해 고정한 ID·본문으로 다시 제출합니다. */
  function retryRegistration() {
    setSubmissionDialogOpen(true);
    submission.retry();
  }

  /** 새 제출의 안내 표시를 복원하며 중복 제출 여부는 기존 제출 상태에서 검증합니다. */
  function submitRegistrationDraft() {
    setSubmissionDialogOpen(true);
    submission.submit(draft);
  }

  let content;
  if (currentStep === 'complete' && submission.result && !showRegisteredDetails) {
    content = (
      <RegistrationComplete
        result={submission.result}
        draft={draft}
        showDetails={submission.resultHasDetails}
        onReview={() => setShowRegisteredDetails(true)}
        onDashboard={onDashboard}
      />
    );
  } else if (currentStep === 'review' || currentStep === 'complete') {
    content = (
      <RegistrationReview
        draft={draft}
        status={submission.status}
        result={submission.result}
        message={submission.message}
        onEdit={navigateSetup}
        onPrevious={() => navigateSetup('fees')}
        onSubmit={submitRegistrationDraft}
        canRetry={submission.canRetry}
        canEdit={submission.canEdit}
        showResultDetails={submission.resultHasDetails}
        dialogOpen={submissionDialogOpen}
        onCheck={checkRegistrationResult}
        onRetry={retryRegistration}
        onEditRegistration={submission.editRegistration}
        onExit={onClose}
        onClose={() => setShowRegisteredDetails(false)}
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
      {inputMessage && currentStep !== 'review' && currentStep !== 'basic' && currentStep !== 'complete' && (
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
      {submissionDialogOpen && ['submitting', 'checking', 'failed', 'unknown'].includes(submission.status) && (
        <SubmissionDialog
          status={submission.status}
          message={submission.message}
          canRetry={submission.canRetry}
          canEdit={submission.canEdit}
          onCheck={checkRegistrationResult}
          onRetry={retryRegistration}
          onEditRegistration={submission.editRegistration}
          onDismissFailure={submission.dismissFailure}
          onDismiss={() => setSubmissionDialogOpen(false)}
        />
      )}
    </>
  );
}
