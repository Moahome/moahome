'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
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
import { PropertyRegistrationDialog } from './propertyRegistrationDialog';
import { UnitSetup } from './_components/unit-setup/unitSetup';
import { BankAccountSetup } from './_components/bank-account-setup/bankAccountSetup';
import { getUnitSetupError } from '../model/unitSetup';

/** 등록 흐름 전체가 초안을 소유해 기본 정보·동·세대·계좌의 단계 이동과 입력 복원을 유지합니다. */
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
  const unitsValid = !getUnitSetupError(draft.basicInfo.hasBuildings === true, draft.buildings, draft.units);
  const isAccountStep = step === 'account' && draft.basicInfoValidated && unitsValid;
  let currentStep: RegistrationStep = 'basic';
  if (step !== 'basic' && draft.basicInfoValidated) currentStep = 'units';
  if (isAccountStep) currentStep = 'account';

  useEffect(() => () => discardRegistrationDraft(), []);

  useEffect(() => {
    saveRegistrationDraft(userId, {
      ...draft,
      step: currentStep
    });
  }, [userId, draft, currentStep]);

  useEffect(() => {
    // URL만으로 검증 단계를 건너뛰지 않으며 새 등록이나 다른 계정은 기본 정보부터 시작합니다.
    if (step !== 'basic' && !draft.basicInfoValidated) {
      router.replace('/start?registration=basic', {
        scroll: false
      });
      return;
    }
    // 계좌 직접 진입이나 이전 단계 변경에도 세대 최소 수·참조 조건을 확인합니다.
    if (step === 'account' && !unitsValid) {
      router.replace('/start?registration=units', {
        scroll: false
      });
    }
  }, [step, draft.basicInfoValidated, unitsValid, router]);

  /** 기본 정보 수정은 기존 동·세대 입력을 유지하되 이전 검증 성공 상태를 해제합니다. */
  const updateBasicInfo = useCallback((changes: Partial<BasicInfoDraft>) => {
    setDraft((previous) => ({
      ...previous,
      basicInfo: {
        ...previous.basicInfo,
        ...changes
      },
      basicInfoValidated: false,
    }));
  }, []);

  /** 서버가 정리한 응답을 적용한 뒤 이동하며 이전 동·세대 배열은 사용자 확인 없이 지우지 않습니다. */
  function completeBasicInfo(basicInfo: BasicInfo) {
    setDraft((previous) => ({
      ...previous,
      basicInfo: {
        ...basicInfo,
        addressDetail: basicInfo.addressDetail ?? '',
        propertyType: basicInfo.propertyType ?? '',
      },
      step: 'units',
      basicInfoValidated: true,
    }));
    router.push('/start?registration=units', {
      scroll: false
    });
  }

  /** 이전 화면과 브라우저 이력 이동 모두 초안을 유지하며 재제출에서는 기본 정보를 다시 검증합니다. */
  function returnToBasicInfo() {
    setDraft((previous) => ({
      ...previous,
      step: 'basic'
    }));
    router.push('/start?registration=basic', {
      scroll: false
    });
  }

  /** 같은 흐름의 초안을 유지하며 이전·다음 URL만 변경하고 중간 저장 API는 호출하지 않습니다. */
  function navigateSetup(nextStep: 'units' | 'account') {
    if (nextStep === 'account' && !unitsValid) return;

    setDraft((previous) => ({
      ...previous,
      step: nextStep
    }));
    router.push(`/start?registration=${nextStep}`, {
      scroll: false
    });
  }

  if (isAccountStep) {
    return (
      <BankAccountSetup
        propertyName={draft.basicInfo.name}
        account={draft.bankAccount}
        onChange={(bankAccount) => setDraft((previous) => ({
          ...previous,
          bankAccount
        }))}
        onPrevious={() => navigateSetup('units')}
      />
    );
  }

  if (currentStep === 'units') {
    return (
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
        onPrevious={returnToBasicInfo}
        onNext={() => navigateSetup('account')}
      />
    );
  }

  return (
    <PropertyRegistrationDialog
      draft={draft.basicInfo}
      onChange={updateBasicInfo}
      onValidated={completeBasicInfo}
      onClose={onClose}
    />
  );
}
