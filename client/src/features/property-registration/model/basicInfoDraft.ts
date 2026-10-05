import {
  EMPTY_BASIC_INFO,
  type BasicInfoDraft
} from './basicInfo';

const DRAFT_STORAGE_KEY = 'moahome.property-registration.basic-info';

/** 같은 탭의 새로고침에서만 본인 초안을 복원하고 새 진입·다른 계정의 초안은 폐기합니다. */
export function restoreBasicInfoDraft(userId: string): BasicInfoDraft {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const stored = sessionStorage.getItem(DRAFT_STORAGE_KEY);

    if (navigation?.type !== 'reload' || !stored) {
      discardBasicInfoDraft();
      return {
        ...EMPTY_BASIC_INFO
      };
    }

    const data = JSON.parse(stored);
    const draft = data?.basicInfo;
    const stringFields = ['name', 'address', 'addressDetail', 'propertyType'] as const;

    // 브라우저 저장소도 신뢰하지 않으며 깨진 값이나 다른 사용자 입력을 화면에 전달하지 않습니다.
    if (data.userId !== userId || !draft
      || !stringFields.every((field) => typeof draft[field] === 'string')
      || !(draft.hasBuildings === null || typeof draft.hasBuildings === 'boolean')) {
      discardBasicInfoDraft();
      return {
        ...EMPTY_BASIC_INFO
      };
    }

    return {
      name: draft.name,
      address: draft.address,
      addressDetail: draft.addressDetail,
      propertyType: draft.propertyType,
      hasBuildings: draft.hasBuildings,
    };
  } catch {
    return {
      ...EMPTY_BASIC_INFO
    };
  }
}

/** 토큰 없이 현재 사용자와 기본 입력만 탭 저장소에 보관하며 저장 차단은 입력을 막지 않습니다. */
export function saveBasicInfoDraft(userId: string, basicInfo: BasicInfoDraft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      userId,
      basicInfo
    }));
  } catch {
    // 저장소가 차단된 브라우저에서는 현재 화면의 메모리 입력을 계속 사용합니다.
  }
}

/** 등록 취소·라우트 이탈·로그아웃으로 화면을 닫으면 이전 입력을 재사용하지 않습니다. */
export function discardBasicInfoDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 저장소 접근이 차단되어도 화면 종료를 계속합니다.
  }
}
