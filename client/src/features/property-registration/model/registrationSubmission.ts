import { ApiError } from '@/shared/api';
import { type RegistrationRequest } from '../api/registrationApi';
import { normalizeBasicInfo } from './basicInfo';
import { getUnitSetupError } from './unitSetup';
import {
  getBankAccountErrors,
  isBankAccountDraft
} from './bankAccount';
import {
  getFeeItemsError,
  isFeeItemDraftList
} from './feeItems';
import { EMPTY_AUTOMATIC_UNIT_RULE } from './automaticUnits';
import type {
  RegistrationDraft,
  RegistrationStep
} from './registrationDraft';

import {
  EMPTY_ADMINISTRATOR,
  getAdministratorError
} from './administrator';

import {
  EMPTY_OPENING_BALANCES,
  getUnitOpening,
  getUnitOpeningError,
  getCashOpeningError,
  getFirstBillingError,
  type OpeningBalancesDraft
} from './openingBalances';

const SUBMISSION_KEY = 'moahome.property-registration.submission';
const RECEIPT_KEY = 'moahome.property-registration.receipt';
const PENDING_PREFIX = 'moahome.property-registration.pending.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PendingRegistration {
  requestId: string;
  request: RegistrationRequest | null;
}

/** 고정된 제출 본문을 실제 등록의 세대 참조와 대조해 복원하며 옛 요청에는 새 인계를 덧붙이지 않습니다. */
function restoreSubmittedOpening(request: RegistrationRequest): OpeningBalancesDraft | null {
  const value = request.openingBalances;
  if (!value) return null;
  if (typeof value.cutoffDate !== 'string' || typeof value.firstBillingMonth !== 'string'
    || !(value.cashCutoffDate === null || typeof value.cashCutoffDate === 'string')
    || !Array.isArray(value.units) || value.units.length !== request.units.length
    || !Array.isArray(value.buildings) || value.buildings.length !== request.buildings.length
    || !Array.isArray(value.accounts) || value.accounts.length !== 1 || value.accounts[0]?.accountIndex !== 0
    || typeof value.accounts[0]?.amount !== 'string') return null;
  const opening: OpeningBalancesDraft = {
    cutoffDate: value.cutoffDate,
    firstBillingMonth: value.firstBillingMonth,
    unitMode: 'ENTER',
    units: {},
    buildings: {},
    accountAmount: value.accounts[0].amount,
    cashCutoffDate: value.cashCutoffDate ?? ''
  };
  const units = request.units.map((unit, index) => ({
    ...unit,
    clientId: String(index)
  }));
  for (const unit of units) {
    const rows = value.units.filter((row) => row?.buildingClientId === unit.buildingClientId && row.unitNumber === unit.unitNumber);
    if (rows.length !== 1 || typeof rows[0].receivable !== 'string' || typeof rows[0].credit !== 'string') return null;
    opening.units[unit.clientId] = {
      receivable: rows[0].receivable,
      credit: rows[0].credit
    };
  }
  for (const building of request.buildings) {
    const rows = value.buildings.filter((row) => row?.buildingClientId === building.clientId);
    if (rows.length !== 1 || typeof rows[0].amount !== 'string') return null;
    opening.buildings[building.clientId] = rows[0].amount;
  }
  if (getUnitOpeningError(opening, units) || getCashOpeningError(opening, request.buildings) || getFirstBillingError(opening)) return null;
  return opening;
}

/** 저장소 본문에도 자료형·업무 검증을 적용하고 허용한 필드만 재구성해 손상된 요청을 재전송하지 않습니다. */
function readStoredRequest(value: unknown): RegistrationRequest | null {
  try {
    const request = value as RegistrationRequest;
    if (!request || !UUID_PATTERN.test(request.requestId) || typeof request.basicInfo?.hasBuildings !== 'boolean'
      || !Array.isArray(request.buildings) || !Array.isArray(request.units) || !Array.isArray(request.feeItems)
      || !Array.isArray(request.bankAccounts) || request.bankAccounts.length !== 1 || !isBankAccountDraft(request.bankAccounts[0])
      || request.buildings.some((building) => !building || typeof building.name !== 'string' || typeof building.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(building.clientId))
      || new Set(request.buildings.map((building) => building.clientId)).size !== request.buildings.length
      || request.units.some((unit) => !unit || typeof unit.unitNumber !== 'string'
        || !(unit.buildingClientId === null || typeof unit.buildingClientId === 'string')
        || !(unit.displayName === null || typeof unit.displayName === 'string')
        || !(unit.floor === null || Number.isInteger(unit.floor))
        || !['ACTIVE', 'VACANT'].includes(unit.status))
      || request.feeItems.some((item) => !item || !Number.isSafeInteger(item.defaultAmount))) return null;

    const feeItems = request.feeItems.map((item, index) => ({
      ...item,
      clientId: String(index),
      defaultAmount: String(item.defaultAmount)
    }));
    if (!isFeeItemDraftList(feeItems)) return null;

    const administrator = request.administrator;
    if (administrator && !['RESIDENT', 'EXTERNAL'].includes(administrator.residenceType)) return null;
    const selectedIndex = administrator?.residenceType === 'RESIDENT' ? request.units.findIndex((unit) => unit.unitNumber === administrator.unitNumber && unit.buildingClientId === administrator.buildingClientId) : -1;
    const openingBalances = restoreSubmittedOpening(request);
    if (request.openingBalances && !openingBalances) return null;
    const restored = createRegistrationRequest({
      administrator: administrator ? {
        residenceType: administrator.residenceType,
        name: administrator.name ?? '',
        phone: administrator.phone ?? '',
        unitClientId: selectedIndex < 0 ? '' : String(selectedIndex)
      } : {
        ...EMPTY_ADMINISTRATOR,
        residenceType: 'EXTERNAL'
      },
      basicInfo: {
        ...request.basicInfo,
        addressDetail: request.basicInfo.addressDetail ?? '',
        propertyType: request.basicInfo.propertyType ?? ''
      },
      buildings: request.buildings,
      units: request.units.map((unit, index) => ({
        ...unit,
        clientId: String(index)
      })),
      bankAccount: request.bankAccounts[0],
      feeItems,
      automaticUnitRule: EMPTY_AUTOMATIC_UNIT_RULE,
      basicInfoValidated: true,
      step: 'review',
      openingBalances: openingBalances ?? {
        ...EMPTY_OPENING_BALANCES
      }
    }, request.requestId, Boolean(request.openingBalances));
    // 이전 버전 제출은 거주 필드를 덧붙이지 않아 서버에 저장된 원래 지문과 일치하게 합니다.
    if (!administrator) delete restored.administrator;
    return restored;
  } catch {
    return null;
  }
}

/** 화면용 세대 ID와 자동 입력 규칙은 제외하고 검증된 입력만 최종 계약으로 변환합니다. */
export function createRegistrationRequest(draft: RegistrationDraft, requestId: string, includeOpening = true): RegistrationRequest {
  if (getAdministratorError(draft.administrator, draft.units) || getUnitSetupError(draft.basicInfo.hasBuildings === true, draft.buildings, draft.units)
    || Object.keys(getBankAccountErrors(draft.bankAccount)).length || getFeeItemsError(draft.feeItems)
    || (includeOpening && (getUnitOpeningError(draft.openingBalances, draft.units) || getCashOpeningError(draft.openingBalances, draft.buildings) || getFirstBillingError(draft.openingBalances)))) {
    throw new Error('등록 정보를 확인해주세요.');
  }

  const selectedUnit = draft.units.find((unit) => unit.clientId === draft.administrator.unitClientId);

  return {
    requestId,
    ...(includeOpening ? {
      openingBalances: {
        cutoffDate: draft.openingBalances.cutoffDate,
        firstBillingMonth: draft.openingBalances.firstBillingMonth,
        units: draft.units.map((unit) => ({
          buildingClientId: unit.buildingClientId,
          unitNumber: unit.unitNumber,
          ...getUnitOpening(draft.openingBalances, unit.clientId)
        })),
        accounts: [{
          accountIndex: 0,
          amount: draft.openingBalances.accountAmount
        }],
        cashCutoffDate: draft.buildings.length ? draft.openingBalances.cashCutoffDate : null,
        buildings: draft.buildings.map((building) => ({
          buildingClientId: building.clientId,
          amount: draft.openingBalances.buildings[building.clientId]
        }))
      }
    } : {}),
    administrator: draft.administrator.residenceType === 'EXTERNAL' ? {
      residenceType: 'EXTERNAL'
    } : {
      residenceType: 'RESIDENT',
      name: draft.administrator.name.trim(),
      ...(draft.administrator.phone.trim() ? {
        phone: draft.administrator.phone.trim()
      } : {}),
      buildingClientId: selectedUnit!.buildingClientId,
      unitNumber: selectedUnit!.unitNumber
    },
    basicInfo: normalizeBasicInfo(draft.basicInfo),
    buildings: draft.buildings.map((building) => ({
      clientId: building.clientId,
      name: building.name
    })),
    units: draft.units.map((unit) => ({
      buildingClientId: unit.buildingClientId,
      unitNumber: unit.unitNumber,
      displayName: unit.displayName,
      floor: unit.floor,
      status: unit.status
    })),
    bankAccounts: [{
      ...draft.bankAccount
    }],
    feeItems: draft.feeItems.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      defaultAmount: Number(item.defaultAmount)
    }))
  };
}

/** 재로그인용 식별자와 같은 탭 새로고침용 민감한 본문을 분리하며 저장소 차단 시 메모리 제출은 유지합니다. */
export function savePendingRegistration(userId: string, request: RegistrationRequest) {
  try { localStorage.setItem(PENDING_PREFIX + userId, request.requestId); } catch { /* 저장소 차단 시 현재 메모리에서만 결과를 확인합니다. */ }
  try { sessionStorage.setItem(SUBMISSION_KEY, JSON.stringify({
    userId,
    request
  })); } catch { /* 새로고침 복원만 제한합니다. */ }
}

/** 결과가 불명확한 ID는 새 진입에도 확인하며 본문은 같은 사용자·탭의 새로고침에서만 복원합니다. */
export function restorePendingRegistration(userId: string): PendingRegistration | null {
  let requestId: string | null = null;
  try { requestId = localStorage.getItem(PENDING_PREFIX + userId); } catch { /* 탭 기록을 별도로 확인합니다. */ }
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const data = JSON.parse(sessionStorage.getItem(SUBMISSION_KEY) ?? 'null');
    if (navigation?.type !== 'reload' || data?.userId !== userId) discardSubmissionBody();
    if (navigation?.type === 'reload' && data?.userId === userId && UUID_PATTERN.test(data.request?.requestId)
      && (!requestId || requestId === data.request.requestId)) {
      return {
        requestId: data.request.requestId,
        request: readStoredRequest(data.request)
      };
    }
  } catch { /* 깨진 본문을 재전송하지 않고 남아 있는 ID로 결과부터 확인합니다. */ }

  return requestId && UUID_PATTERN.test(requestId) ? {
    requestId,
    request: null
  } : null;
}

/** 흐름 이탈·로그아웃은 계좌가 포함된 본문만 폐기하고 미확인 요청 ID는 결과 확인까지 유지합니다. */
export function discardSubmissionBody() {
  try { sessionStorage.removeItem(SUBMISSION_KEY); } catch { /* 브라우저 저장소 차단을 무시합니다. */ }
}

/** 이전 비동기 요청이 다른 등록의 결과 확인 정보를 삭제하지 않도록 요청 ID를 함께 비교합니다. */
export function clearPendingRegistration(userId: string, requestId: string) {
  try {
    if (localStorage.getItem(PENDING_PREFIX + userId) === requestId) localStorage.removeItem(PENDING_PREFIX + userId);
  } catch { /* 식별자 저장소가 차단되어도 민감한 본문 폐기를 계속합니다. */ }
  try {
    const data = JSON.parse(sessionStorage.getItem(SUBMISSION_KEY) ?? 'null');
    if (data?.userId === userId && data.request?.requestId === requestId) discardSubmissionBody();
  } catch { /* 저장소 차단은 완료 표시를 막지 않습니다. */ }
}

/** 완료 기록에는 조회용 ID만 남기며 표시할 정보와 현재 권한은 서버에서 다시 확인합니다. */
export function saveRegistrationReceipt(userId: string, requestId: string) {
  try { sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({
    userId,
    requestId
  })); } catch { /* 현재 화면의 완료 상태를 유지합니다. */ }
}

/** 브라우저 기록은 성공 증명이 아니며 본인의 기존 기록에서도 서버 조회에 쓸 ID만 읽습니다. */
export function restoreRegistrationReceipt(userId: string): string | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? 'null');
    // 이전 버전의 요약도 ID만 사용해 조작된 요약이나 해제된 권한을 그대로 복원하지 않습니다.
    const requestId = data?.requestId ?? data?.result?.requestId;
    if (data?.userId === userId && isRegistrationRequestId(requestId)) {
      // 조회가 실패해도 이전 버전의 요약을 브라우저에 계속 보관하지 않습니다.
      saveRegistrationReceipt(userId, requestId);
      return requestId;
    }
  } catch { /* 손상된 기록은 완료 화면을 여는 근거로 사용하지 않습니다. */ }

  discardRegistrationReceipt();
  return null;
}

/** URL과 저장소의 조회 ID는 형식만 검증하며 소유권과 현재 권한은 API가 검증합니다. */
export function isRegistrationRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** 완료 화면 이탈 뒤에는 이전 조회 ID를 새 등록에 재사용하지 않도록 폐기합니다. */
export function discardRegistrationReceipt() {
  try { sessionStorage.removeItem(RECEIPT_KEY); } catch { /* 저장소가 차단되어도 화면을 닫습니다. */ }
}

/** 일반 시작 진입이 미확인 제출 복구를 건너뛰지 않도록 본인 요청의 존재만 확인합니다. */
export function hasPendingRegistration(userId: string) {
  try {
    if (isRegistrationRequestId(localStorage.getItem(PENDING_PREFIX + userId))) return true;
  } catch { /* 탭의 제출 기록도 확인합니다. */ }
  try {
    const data = JSON.parse(sessionStorage.getItem(SUBMISSION_KEY) ?? 'null');
    return data?.userId === userId && isRegistrationRequestId(data?.request?.requestId);
  } catch { return false; }
}

/** 서버 필드 경로를 입력 단계와 화면용 설명으로 바꾸고 서버 메시지·입력 원문을 노출하지 않습니다. */
export function getRegistrationInputError(error: ApiError): { step: RegistrationStep; message: string } {
  const field = error.errors[0]?.field ?? '';
  const reason = error.errors[0]?.reason;
  const steps: Record<string, RegistrationStep> = {
    basicInfo: 'basic',
    administrator: 'units',
    buildings: 'units',
    units: 'units',
    bankAccounts: 'account',
    feeItems: 'fees'
  };
  const rootField = field.split(/[.[]/)[0];
  let step = Object.hasOwn(steps, rootField) ? steps[rootField] : 'review';
  if (rootField === 'openingBalances') {
    step = 'units';
    if (/openingBalances\.(accounts|cashCutoffDate|buildings)/.test(field)) step = 'account';
    if (field.startsWith('openingBalances.firstBillingMonth')) step = 'fees';
  }
  const labels: Record<string, string> = {
    basic: '기본 정보',
    units: '동·세대 정보',
    administrator: '관리 담당자',
    account: '관리계좌',
    fees: '관리비 항목',
    review: '등록 정보'
  };
  const reasons: Record<string, string> = {
    REQUIRED: '필수 입력을 확인해주세요.',
    INVALID_TYPE: '입력 형식을 확인해주세요.',
    INVALID_FORMAT: '입력 형식을 확인해주세요.',
    TOO_LONG: '입력 길이를 확인해주세요.',
    OUT_OF_RANGE: '입력 가능한 범위를 확인해주세요.',
    DUPLICATE: '중복된 입력을 확인해주세요.',
    INVALID_REFERENCE: '세대가 속한 동을 확인해주세요.',
    INVALID_COMBINATION: '입력한 정보의 연결과 기본 지정을 확인해주세요.'
  };

  return {
    step,
    message: `${labels[step]}: ${reasons[reason ?? ''] ?? '입력한 정보를 확인해주세요.'}`
  };
}
