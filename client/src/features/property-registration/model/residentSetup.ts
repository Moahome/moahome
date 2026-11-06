import { normalizeResidentPhone } from '@/entities/resident';
import type { AdministratorDraft } from './administratorTypes';
import type { RegistrationResident } from './residentSetupTypes';
import type { UnitDraft } from './unitSetupTypes';

/** 관리소장 예외는 같은 세대와 정리한 이름으로만 판단하고 다른 세대의 동명이인은 유지합니다. */
export function isAdministratorResident(resident: RegistrationResident, administrator: AdministratorDraft) {
  return administrator.residenceType === 'RESIDENT' && resident.unitClientId === administrator.unitClientId
    && resident.name.trim() === administrator.name.trim();
}

/** 새 명부는 세대 참조·이름·선택 번호 동의를 검증하며 관리소장 정보에 자동 병합하지 않습니다. */
export function getResidentDraftError(resident: RegistrationResident, units: UnitDraft[], administrator: AdministratorDraft) {
  if (!units.some((unit) => unit.clientId === resident.unitClientId)) return '등록한 세대를 선택해주세요.';
  if (!resident.name.trim() || [...resident.name.trim()].length > 50) return '주민 이름을 1~50자로 입력해주세요.';
  if (isAdministratorResident(resident, administrator)) return '담당자 단계에 등록된 관리소장입니다. 중복 등록에서 제외합니다.';
  if (!['OWNER', 'TENANT', 'FAMILY', 'OTHER'].includes(resident.relationType)) return '주민 구분을 확인해주세요.';
  if (resident.phone.trim() && !resident.phoneConsent) return '전화번호 수집·이용 동의를 확인해주세요.';
  try { normalizeResidentPhone(resident.phone); } catch { return '올바른 전화번호를 입력해주세요.'; }
  return '';
}

/** 담당자 변경으로 생긴 중복을 제외한 뒤 최소 인원과 모든 주민의 유효성을 같은 기준으로 검사합니다. */
export function getResidentSetupError(residents: RegistrationResident[], units: UnitDraft[], administrator: AdministratorDraft) {
  const included = residents.filter((resident) => !isAdministratorResident(resident, administrator));
  const hasAdministrator = administrator.residenceType === 'RESIDENT' && units.some((unit) => unit.clientId === administrator.unitClientId) && Boolean(administrator.name.trim());
  if (!included.length && !hasAdministrator) return '관리할 곳의 주민을 1명 이상 등록해주세요.';
  if (included.length > 1000) return '주민은 한 번에 최대 1,000명까지 등록할 수 있습니다.';
  const contacts = new Set<string>();
  for (const resident of included) {
    const error = getResidentDraftError(resident, units, administrator);
    if (error) return error;
    const phone = normalizeResidentPhone(resident.phone);
    if (!phone) continue;
    const key = JSON.stringify([resident.name.trim(), phone]);
    if (contacts.has(key)) return '이름과 전화번호가 같은 주민이 중복되었습니다.';
    contacts.add(key);
  }
  return '';
}

/** 같은 탭의 복원에서도 자료형을 검사하고 동의하지 않은 번호는 초안에 되살리지 않습니다. */
export function restoreRegistrationResidents(value: unknown): RegistrationResident[] {
  if (!Array.isArray(value) || value.length > 1000) return [];
  return value.filter((row): row is RegistrationResident => Boolean(row && typeof row.clientId === 'string'
    && typeof row.unitClientId === 'string' && typeof row.name === 'string' && typeof row.phone === 'string'
    && typeof row.phoneConsent === 'boolean' && ['OWNER', 'TENANT', 'FAMILY', 'OTHER'].includes(row.relationType)))
    .map((row) => ({
      clientId: row.clientId,
      unitClientId: row.unitClientId,
      name: row.name,
      phone: row.phoneConsent ? row.phone : '',
      phoneConsent: row.phoneConsent,
      relationType: row.relationType
    }));
}
