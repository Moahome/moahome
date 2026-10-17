'use client';

import {
  useEffect,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from '@/shared/ui/toast';
import {
  MANAGER_PREVIEW_STORAGE_KEY,
  restoreRegistrationDraft,
  saveRegistrationDraft,
  discardRegistrationDraft,
  type RegistrationStep
} from '../../model/registrationDraft';
import { getUnitSetupError } from '../../model/unitSetup';
import { getBankAccountErrors } from '../../model/bankAccount';
import { getFeeItemsError } from '../../model/feeItems';
import { PropertyRegistrationDialog } from '../property-registration-dialog/propertyRegistrationDialog';
import { UnitSetup } from '../_components/unit-setup/unitSetup';
import { AdministratorSetup } from '../_components/administrator-setup/administratorSetup';
import { BankAccountSetup } from '../_components/bank-account-setup/bankAccountSetup';
import { FeeItemsSetup } from '../_components/fee-items-setup/feeItemsSetup';
import { RegistrationReview } from '../_components/registration-review/registrationReview';

export type PreviewStep = RegistrationStep;
const STEPS: PreviewStep[] = ['basic', 'units', 'administrator', 'account', 'fees', 'review'];

/** 저장 기능과 분리한 여섯 단계 UI입니다. 실제 등록·권한·계정 연결 요청은 호출하지 않습니다. */
export function PropertyRegistrationPreview({ userId, step, onClose }: {
  userId: string;
  step: PreviewStep;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => restoreRegistrationDraft(userId, MANAGER_PREVIEW_STORAGE_KEY));
  const [notice, setNotice] = useState('');
  const profile = draft.administrator;
  const unitsValid = !getUnitSetupError(draft.basicInfo.hasBuildings === true, draft.buildings, draft.units);
  const administratorValid = Boolean(profile.name.trim() && profile.residenceType && (profile.residenceType === 'EXTERNAL' || draft.units.some((unit) => unit.clientId === profile.unitClientId)));
  const allowed = [true, draft.basicInfoValidated, unitsValid, administratorValid, !Object.keys(getBankAccountErrors(draft.bankAccount)).length, !getFeeItemsError(draft.feeItems)];
  const requestedIndex = STEPS.indexOf(step);
  const firstInvalid = allowed.findIndex((valid, index) => index <= requestedIndex && !valid);
  const currentStep = firstInvalid === -1 ? step : STEPS[Math.max(0, firstInvalid - 1)];

  useEffect(() => {
    saveRegistrationDraft(userId, {
      ...draft,
      step: currentStep
    }, MANAGER_PREVIEW_STORAGE_KEY);
  }, [userId, draft, currentStep]);

  useEffect(() => () => discardRegistrationDraft(MANAGER_PREVIEW_STORAGE_KEY), []);

  useEffect(() => {
    if (step === currentStep) return;
    router.replace(`/properties/add?preview=manager&registration=${currentStep}`, {
      scroll: false
    });
  }, [currentStep, step, router]);

  /** 브라우저 이력과 입력 초안을 유지하고 모든 단계에 미리보기 표식을 전달합니다. */
  function navigate(nextStep: PreviewStep) {
    router.push(`/properties/add?preview=manager&registration=${nextStep}`, {
      scroll: false
    });
  }

  let content;
  if (currentStep === 'basic') {
    content = (
      <PropertyRegistrationDialog
        previewOnly
        draft={draft.basicInfo}
        onChange={(changes) => setDraft((previous) => ({
          ...previous,
          basicInfo: {
            ...previous.basicInfo,
            ...changes
          },
          basicInfoValidated: false
        }))}
        onValidated={(basicInfo) => { setDraft((previous) => ({
          ...previous,
          basicInfo: {
            ...basicInfo,
            addressDetail: basicInfo.addressDetail ?? '',
            propertyType: basicInfo.propertyType ?? ''
          },
          basicInfoValidated: true
        })); navigate('units'); }}
        onClose={onClose}
      />
    );
  }
  if (currentStep === 'units') {
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
          units
        }))}
        onPrevious={() => navigate('basic')}
        onNext={() => navigate('administrator')}
      />
    );
  }
  if (currentStep === 'administrator') {
    content = (
      <AdministratorSetup
        draft={draft}
        onChange={(administrator) => setDraft((previous) => ({
          ...previous,
          administrator
        }))}
        onPrevious={() => navigate('units')}
        onNext={() => navigate('account')}
      />
    );
  }
  if (currentStep === 'account') {
    content = (
      <BankAccountSetup
        propertyName={draft.basicInfo.name}
        account={draft.bankAccount}
        onChange={(bankAccount) => setDraft((previous) => ({
          ...previous,
          bankAccount
        }))}
        onPrevious={() => navigate('administrator')}
        onNext={() => navigate('fees')}
      />
    );
  }
  if (currentStep === 'fees') {
    content = (
      <FeeItemsSetup
        propertyName={draft.basicInfo.name}
        items={draft.feeItems}
        onChange={(feeItems) => setDraft((previous) => ({
          ...previous,
          feeItems
        }))}
        onPrevious={() => navigate('account')}
        onNext={() => navigate('review')}
      />
    );
  }
  if (currentStep === 'review') {
    content = (
      <RegistrationReview
        draft={draft}
        previewOnly
        status={'idle'}
        result={null}
        message={''}
        canRetry={false}
        canEdit={true}
        showResultDetails={false}
        dialogOpen={false}
        onEdit={navigate}
        onEditAdministrator={() => navigate('administrator')}
        onPrevious={() => navigate('fees')}
        onSubmit={() => setNotice('미리보기를 확인했어요. 실제 등록과 계정 연결은 저장하지 않았어요.')}
        onCheck={() => {}}
        onRetry={() => {}}
        onEditRegistration={() => {}}
        onExit={onClose}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      {content}
      {notice && (
        <Toast
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </>
  );
}
