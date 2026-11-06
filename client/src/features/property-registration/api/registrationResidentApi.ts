import { authenticatedAPI } from '@/entities/session';
import type { AdministratorDraft } from '../model/administratorTypes';
import type { RegistrationResidentImportRow } from '../model/residentSetupTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../model/unitSetupTypes';

/** 아직 저장하지 않은 세대 초안으로 엑셀을 검증하며 서버는 명부나 임시 DB 레코드를 만들지 않습니다. */
export async function previewRegistrationResidents(file: File, hasBuildings: boolean, buildings: BuildingDraft[], units: UnitDraft[], administrator: AdministratorDraft): Promise<RegistrationResidentImportRow[]> {
  const data = new FormData();
  data.append('file', file);
  data.append('setup', new Blob([JSON.stringify({
    hasBuildings,
    buildings,
    units: units.map(({ buildingClientId, unitNumber }) => ({
      buildingClientId,
      unitNumber
    })),
    administrator: administrator.residenceType === 'RESIDENT' ? {
      name: administrator.name.trim(),
      unitIndex: units.findIndex((unit) => unit.clientId === administrator.unitClientId)
    } : null
  })], {
    type: 'application/json'
  }));
  return authenticatedAPI<RegistrationResidentImportRow[]>({
    url: '/api/property-registrations/resident-import/preview',
    method: 'POST',
    data,
    timeoutMs: 60_000
  });
}
