'use client';

import {
  Input,
  Radio
} from '@/shared/ui/form-controls';
import type { AdministratorDraft } from '../../../model/administratorTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import { AdministratorUnitFields } from '../administrator-unit-fields/administratorUnitFields';
import styles from './administratorProfile.module.css';

/** 기존 세대 초안에서 본인의 거주 세대를 선택하고 외부 선택에서는 주민 정보를 제출하지 않습니다. */
export function AdministratorProfile({ profile, units, buildings, hasBuildings, onChange }: {
  profile: AdministratorDraft;
  units: UnitDraft[];
  buildings: BuildingDraft[];
  hasBuildings: boolean;
  onChange: (profile: AdministratorDraft) => void;
}) {
  return (
    <section
      className={styles.section}
      aria-label={'관리소장 정보'}
    >
      <fieldset
        className={styles.options}
      >
        <legend>
          이곳에 거주하시나요?
        </legend>
        <Radio
          name={'administrator-residence'}
          label={'거주 관리소장'}
          description={'주민 명부에 본인을 함께 등록합니다.'}
          variant={'card'}
          checked={profile.residenceType === 'RESIDENT'}
          onChange={() => onChange({
            ...profile,
            residenceType: 'RESIDENT'
          })}
        />
        <Radio
          name={'administrator-residence'}
          label={'외부 관리소장'}
          description={'주민 명부에 등록하지 않습니다.'}
          variant={'card'}
          checked={profile.residenceType === 'EXTERNAL'}
          onChange={() => onChange({
            residenceType: 'EXTERNAL',
            name: '',
            phone: '',
            unitClientId: ''
          })}
        />
      </fieldset>
      {profile.residenceType === 'RESIDENT' && (
        <div
          className={styles.fields}
        >
          <Input
            label={'관리소장 이름'}
            value={profile.name}
            maxLength={50}
            autoComplete={'name'}
            required
            onChange={(event) => onChange({
              ...profile,
              name: event.target.value
            })}
          />
          <Input
            label={'관리소장 연락처'}
            value={profile.phone}
            maxLength={64}
            type={'tel'}
            autoComplete={'tel'}
            onChange={(event) => onChange({
              ...profile,
              phone: event.target.value
            })}
          />
          <AdministratorUnitFields
            units={units}
            buildings={buildings}
            hasBuildings={hasBuildings}
            unitClientId={profile.unitClientId}
            onChange={(unitClientId) => onChange({
              ...profile,
              unitClientId
            })}
          />
        </div>
      )}
    </section>
  );
}
