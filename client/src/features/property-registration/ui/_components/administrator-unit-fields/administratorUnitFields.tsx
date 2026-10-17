'use client';

import { useState } from 'react';
import { SelectDropdown } from '@/shared/ui/form-controls';
import {
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '../../../model/unitSetup';
import styles from './administratorUnitFields.module.css';

/** 동 변경 시 호수를 다시 선택하게 하며 두 입력 모두 공통 검색 드롭다운을 재사용합니다. */
export function AdministratorUnitFields({ units, buildings, hasBuildings, unitClientId, onChange }: {
  units: UnitDraft[];
  buildings: BuildingDraft[];
  hasBuildings: boolean;
  unitClientId: string;
  onChange: (unitClientId: string) => void;
}) {
  const selectedUnit = units.find((unit) => unit.clientId === unitClientId);
  const [buildingId, setBuildingId] = useState(selectedUnit?.buildingClientId ?? '');
  const selectedBuilding = selectedUnit?.buildingClientId ?? buildingId;
  const buildingExists = buildings.some((building) => building.clientId === selectedBuilding);
  const availableUnits = units.filter((unit) => !hasBuildings || (buildingExists && unit.buildingClientId === selectedBuilding));

  return (
    <div
      className={styles.fields}
      data-has-buildings={hasBuildings}
    >
      {hasBuildings && (
        <SelectDropdown
          label={'거주 동'}
          required
          placeholder={'동 선택 또는 검색'}
          value={buildingExists ? selectedBuilding : ''}
          options={buildings.map((building) => ({
            value: building.clientId,
            label: building.name
          }))}
          onChange={(value) => {
            setBuildingId(value);
            // 다른 동의 이전 호수를 유지하면 잘못된 세대에 연결되므로 선택을 해제합니다.
            onChange('');
          }}
        />
      )}
      <SelectDropdown
        label={'거주 호수'}
        required
        placeholder={hasBuildings && !buildingExists ? '동을 먼저 선택해주세요' : '호수 선택 또는 검색'}
        value={availableUnits.some((unit) => unit.clientId === unitClientId) ? unitClientId : ''}
        disabled={hasBuildings && !buildingExists}
        options={availableUnits.map((unit) => ({
          value: unit.clientId,
          label: getUnitLabel(unit)
        }))}
        onChange={onChange}
      />
    </div>
  );
}
