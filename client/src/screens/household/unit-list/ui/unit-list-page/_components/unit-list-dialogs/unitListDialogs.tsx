import {
  BuildingUnitFormModal,
  BuildingManager,
  AutomaticUnitEditor,
  UnitDeleteConfirmation,
  getUnitLabel
} from '@/entities/property';
import { getUnitListError } from '../../../../model/unitList';
import type { UnitListController } from '../../_hooks/useUnitList';
import { UnitDetailModal } from '../unit-detail-modal/unitDetailModal';
import styles from './unitListDialogs.module.css';

/** 등록에서 사용한 모달을 그대로 조합하고 저장·삭제 오류와 대기 상태만 연결합니다. */
export function UnitListDialogs({
  controller,
}: {
  controller: UnitListController;
}) {
  const { data, dialog, unitMutation, buildingMutation, automaticMutation, deleteMutation } = controller;
  const detailUnit = dialog?.kind === 'detail' ? data.units.find((unit) => unit.clientId === dialog.unitId) : undefined;

  return (
    <>
      {detailUnit && (
        <UnitDetailModal
          unit={detailUnit}
          hasBuildings={data.hasBuildings}
          buildingName={data.buildings.find((building) => building.clientId === detailUnit.buildingClientId)?.name}
          onEdit={() => controller.openEditor(detailUnit.clientId)}
          onDelete={() => controller.requestDeletion(detailUnit.clientId)}
          busy={deleteMutation.isPending}
          onClose={() => controller.setDialog(null)}
        />
      )}
      {dialog?.kind === 'buildings' && (
        <BuildingManager
          buildings={data.buildings}
          units={data.units}
          busy={buildingMutation.isPending}
          errorMessage={buildingMutation.isError ? getUnitListError(buildingMutation.error) : ''}
          onSave={(building) => controller.executeBuildingCommand({
            kind: 'save',
            building
          })}
          onDelete={(buildingId) => controller.executeBuildingCommand({
            kind: 'delete',
            buildingId
          })}
          onClose={() => controller.setDialog(null)}
        />
      )}
      {dialog?.kind === 'automatic' && (
        <AutomaticUnitEditor
          rule={controller.automaticRule}
          onRuleChange={controller.setAutomaticRule}
          hasBuildings={data.hasBuildings}
          buildings={data.buildings}
          units={data.units}
          initialBuildingClientId={controller.filters.buildingId || undefined}
          busy={automaticMutation.isPending}
          errorMessage={automaticMutation.isError ? getUnitListError(automaticMutation.error) : ''}
          onAdd={controller.addAutomatic}
          onClose={() => controller.setDialog(null)}
        />
      )}
      {dialog?.kind === 'unit' && (
        <BuildingUnitFormModal
          target={dialog.target}
          hasBuildings={data.hasBuildings}
          buildings={data.buildings}
          units={data.units}
          busy={unitMutation.isPending}
          errorMessage={unitMutation.isError ? getUnitListError(unitMutation.error) : ''}
          onSaveUnit={(unit) => unitMutation.mutate({
            unit,
            editingId: dialog.target.clientId
          })}
          onClose={() => controller.setDialog(null)}
        />
      )}
      {controller.pendingUnit && (
        <UnitDeleteConfirmation
          label={'1세대'}
          fallbackFocusRef={controller.listTitleRef}
          busy={deleteMutation.isPending}
          errorMessage={deleteMutation.isError ? getUnitListError(deleteMutation.error) : ''}
          onConfirm={() => {
            if (controller.pendingUnit) deleteMutation.mutate(controller.pendingUnit.clientId);
          }}
          onClose={controller.closeDeletion}
        >
          <ul
            className={styles.targets}
          >
            <li>
              {data.buildings.find((building) => building.clientId === controller.pendingUnit?.buildingClientId)?.name}
              {' '}
              {getUnitLabel({
                ...controller.pendingUnit,
                displayName: null
              })}
            </li>
          </ul>
        </UnitDeleteConfirmation>
      )}
    </>
  );
}
