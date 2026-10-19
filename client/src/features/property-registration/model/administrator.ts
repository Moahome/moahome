import { getTextLength } from '@/shared/lib/format';
import type { AdministratorDraft } from './administratorTypes';
import type { UnitDraft } from './unitSetupTypes';

export const EMPTY_ADMINISTRATOR: AdministratorDraft = {
  residenceType: '',
  name: '',
  phone: '',
  unitClientId: ''
};

/** 등록자는 로그인 계정으로 고정하고 거주를 선택한 경우에만 명부 입력과 같은 등록의 세대를 확인합니다. */
export function getAdministratorError(profile: AdministratorDraft, units: UnitDraft[]): string {
  if (!profile.residenceType) return '관리소장의 거주 여부를 선택해주세요.';
  if (profile.residenceType === 'EXTERNAL') return '';
  if (!profile.name.trim() || getTextLength(profile.name.trim()) > 50) return '관리소장 이름을 1~50자로 입력해주세요.';
  const phone = profile.phone.trim();
  const digits = phone.replace(/[ ()-]/g, '');
  if (phone && (phone.length > 64 || !/^\+?[0-9 ()-]+$/.test(phone)
    || !(/^(0[1-9][0-9]{7,9}|\+[1-9][0-9]{3,14})$/.test(digits)))) return '관리소장 연락처를 확인해주세요.';
  if (!units.some((unit) => unit.clientId === profile.unitClientId)) return '등록한 세대 중 거주하는 세대를 선택해주세요.';
  return '';
}

/** 저장소의 거주 선택을 자료형 확인 후 복원하고 없거나 손상된 값은 다시 선택하게 합니다. */
export function restoreAdministrator(value: unknown): AdministratorDraft {
  if (!value || typeof value !== 'object') return {
    ...EMPTY_ADMINISTRATOR
  };
  const profile = value as AdministratorDraft;
  if (!['', 'RESIDENT', 'EXTERNAL'].includes(profile.residenceType)
    || [profile.name, profile.phone, profile.unitClientId].some((field) => typeof field !== 'string')) return {
    ...EMPTY_ADMINISTRATOR
  };
  return {
    residenceType: profile.residenceType,
    name: profile.name,
    phone: profile.phone,
    unitClientId: profile.unitClientId
  };
}
