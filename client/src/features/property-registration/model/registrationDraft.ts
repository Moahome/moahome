import {
  EMPTY_AUTOMATIC_UNIT_RULE,
  type AutomaticUnitRule
} from './automaticUnits';
import {
  EMPTY_BASIC_INFO,
  getBasicInfoErrors,
  type BasicInfoDraft
} from './basicInfo';
import {
  normalizeBuildingName,
  getUnitSetupError,
  type BuildingDraft,
  type UnitDraft
} from './unitSetup';
import {
  EMPTY_BANK_ACCOUNT,
  isBankAccountDraft,
  getBankAccountErrors,
  normalizeAccountNumber,
  type BankAccountDraft
} from './bankAccount';
import {
  isFeeItemDraftList,
  getFeeItemsError,
  type FeeItemDraft
} from './feeItems';
import { UNIT_STATUS_OPTIONS } from '@/entities/property';

import {
  EMPTY_ADMINISTRATOR,
  restoreAdministrator,
  type AdministratorDraft
} from './administrator';

const LEGACY_PREVIEW_STORAGE_KEY = 'moahome.property-registration.manager-preview';

const DRAFT_STORAGE_KEY = 'moahome.property-registration.basic-info';

export type RegistrationStep = 'basic' | 'units' | 'administrator' | 'account' | 'fees' | 'review';

export interface RegistrationDraft {
  basicInfo: BasicInfoDraft;
  administrator: AdministratorDraft;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  automaticUnitRule: AutomaticUnitRule;
  bankAccount: BankAccountDraft;
  feeItems: FeeItemDraft[];
  step: RegistrationStep;
  basicInfoValidated: boolean;
}

/** 새 등록에는 예시 세대를 넣지 않고 기본 입력과 빈 동·세대 목록을 만듭니다. */
function createEmptyDraft(): RegistrationDraft {
  return {
    administrator: {
      ...EMPTY_ADMINISTRATOR
    },
    basicInfo: {
      ...EMPTY_BASIC_INFO
    },
    buildings: [],
    units: [],
    automaticUnitRule: {
      ...EMPTY_AUTOMATIC_UNIT_RULE
    },
    bankAccount: {
      ...EMPTY_BANK_ACCOUNT
    },
    feeItems: [],
    step: 'basic',
    basicInfoValidated: false,
  };
}

/** 브라우저 저장소의 세대도 타입과 ID를 확인하되 수정 중인 동 참조 불일치는 화면에서 해결합니다. */
function isUnitDraft(value: unknown): value is UnitDraft {
  if (!value || typeof value !== 'object') return false;

  const unit = value as UnitDraft;

  return typeof unit.clientId === 'string' && Boolean(unit.clientId)
    && (unit.buildingClientId === null || typeof unit.buildingClientId === 'string')
    && typeof unit.unitNumber === 'string'
    && (unit.displayName === null || typeof unit.displayName === 'string')
    && (unit.floor === null || (Number.isInteger(unit.floor) && unit.floor >= -32768 && unit.floor <= 32767))
    && (unit.status === 'INACTIVE' || UNIT_STATUS_OPTIONS.some((option) => option.value === unit.status));
}

/** 같은 사용자·탭의 새로고침에서만 단계와 입력을 복원하며 다른 계정·깨진 초안은 폐기합니다. */
export function restoreRegistrationDraft(userId: string): RegistrationDraft {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // 이전 미리보기에서 작성하던 입력도 같은 사용자·탭의 새로고침에서만 검증해 실제 등록으로 이어받습니다.
    const legacyPreview = window.location.pathname === '/properties/add'
      && new URLSearchParams(window.location.search).get('preview') === 'manager';
    const stored = (legacyPreview ? sessionStorage.getItem(LEGACY_PREVIEW_STORAGE_KEY) : null)
      ?? sessionStorage.getItem(DRAFT_STORAGE_KEY);

    if (navigation?.type !== 'reload' || !stored) {
      discardRegistrationDraft();
      return createEmptyDraft();
    }

    const data = JSON.parse(stored);
    const basicInfo = data?.basicInfo;
    const buildings = data?.buildings ?? [];
    const units = data?.units ?? [];
    const automaticUnitRule = data?.automaticUnitRule;
    // 이전 초안과 손상된 생성 규칙도 동·세대 입력은 유지하고 규칙만 기본값으로 복원합니다.
    const restoredRule: AutomaticUnitRule = automaticUnitRule
      && ['startFloor', 'endFloor', 'unitsPerFloor'].every((field) => typeof automaticUnitRule[field] === 'string')
      ? {
        startFloor: automaticUnitRule.startFloor,
        endFloor: automaticUnitRule.endFloor,
        unitsPerFloor: automaticUnitRule.unitsPerFloor,
      }
      : {
        ...EMPTY_AUTOMATIC_UNIT_RULE
      };

    if (data?.userId !== userId || !basicInfo
      || !['name', 'address', 'addressDetail', 'propertyType'].every((field) => typeof basicInfo[field] === 'string')
      || !(basicInfo.hasBuildings === null || typeof basicInfo.hasBuildings === 'boolean')
      || !Array.isArray(buildings) || !buildings.every((building) => building && typeof building.clientId === 'string'
        && /^[A-Za-z0-9_-]{1,50}$/.test(building.clientId) && typeof building.name === 'string')
      || !Array.isArray(units) || !units.every(isUnitDraft)
      || new Set(buildings.map((building) => building.clientId)).size !== buildings.length
      || new Set(units.map((unit) => unit.clientId)).size !== units.length) {
      discardRegistrationDraft();
      return createEmptyDraft();
    }

    const basicInfoValidated = data.basicInfoValidated === true && Object.keys(getBasicInfoErrors(basicInfo)).length === 0;
    const unitsValid = basicInfoValidated && !getUnitSetupError(basicInfo.hasBuildings === true, buildings, units);
    let step: RegistrationStep = 'basic';
    if (basicInfoValidated && ['units', 'administrator', 'account', 'fees', 'review'].includes(data.step)) step = 'units';
    if (['administrator', 'account', 'fees', 'review'].includes(data.step) && unitsValid) step = 'administrator';
    if (['account', 'fees', 'review'].includes(data.step) && step === 'administrator') step = 'account';

    // 이전 초안의 구분 기호를 정리하고 숫자가 아닌 문자가 남으면 번호를 다시 입력받습니다.
    const accountNumber = isBankAccountDraft(data.bankAccount) ? normalizeAccountNumber(data.bankAccount.accountNumber) : '';
    const bankAccount = isBankAccountDraft(data.bankAccount) ? {
      bankCode: data.bankAccount.bankCode,
      bankName: data.bankAccount.bankName,
      accountNumber: /^[0-9]*$/.test(accountNumber) ? accountNumber : '',
      holderName: data.bankAccount.holderName,
      isPrimary: data.bankAccount.isPrimary,
    } : {
      ...EMPTY_BANK_ACCOUNT
    };
    if (['fees', 'review'].includes(data.step) && unitsValid && !Object.keys(getBankAccountErrors(bankAccount)).length) step = 'fees';

    // 코드 필드가 없던 기존 초안은 직접 입력으로 복원하고 이름으로 종류를 추측하지 않습니다.
    const feeItems = Array.isArray(data.feeItems) ? data.feeItems.map((item: unknown) => {
      if (!item || typeof item !== 'object') return item;

      return {
        ...item,
        itemCode: 'itemCode' in item ? item.itemCode : null
      };
    }) : data.feeItems;

    if (data.step === 'review' && step === 'fees' && isFeeItemDraftList(feeItems) && !getFeeItemsError(feeItems)) step = 'review';

    return {
      administrator: restoreAdministrator(data.administrator),
      basicInfo: {
        name: basicInfo.name,
        address: basicInfo.address,
        addressDetail: basicInfo.addressDetail,
        propertyType: basicInfo.propertyType,
        hasBuildings: basicInfo.hasBuildings,
      },
      buildings: buildings.map((building: BuildingDraft) => ({
        clientId: building.clientId,
        name: normalizeBuildingName(building.name)
      })),
      units: units.map((unit: UnitDraft) => ({
        clientId: unit.clientId,
        buildingClientId: unit.buildingClientId,
        unitNumber: unit.unitNumber,
        displayName: unit.displayName,
        floor: unit.floor,
        status: unit.status,
      })),
      automaticUnitRule: restoredRule,
      bankAccount,
      feeItems: isFeeItemDraftList(feeItems) ? feeItems : [],
      step,
      basicInfoValidated,
    };
  } catch {
    discardRegistrationDraft();
    return createEmptyDraft();
  }
}

/** 같은 탭 새로고침 복원용 입력을 보관하고 저장소 차단 시에도 현재 화면의 메모리 입력은 유지합니다. */
export function saveRegistrationDraft(userId: string, draft: RegistrationDraft) {
  try {
    // 진행 중 계좌 입력도 확정된 새로고침 복원 정책에 따라 탭 초안에 포함하고 이탈·로그아웃에 폐기합니다.
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      userId,
      ...draft
    }));
    // 실제 초안 저장이 성공한 뒤 이전 미리보기 사본을 제거해 입력을 두 곳에 보관하지 않습니다.
    sessionStorage.removeItem(LEGACY_PREVIEW_STORAGE_KEY);
  } catch {
    // 인증 토큰은 초안에 넣지 않으며 저장 차단은 등록 입력을 막지 않습니다.
  }
}

/** 단계 사이 이동에는 유지하고 등록 취소·흐름 밖 이탈·로그아웃에만 초안을 폐기합니다. */
export function discardRegistrationDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_PREVIEW_STORAGE_KEY);
  } catch {
    // 저장소 접근이 차단되어도 등록 흐름 종료를 계속합니다.
  }
}
