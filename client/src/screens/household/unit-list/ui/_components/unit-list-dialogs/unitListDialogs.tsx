import {
  BuildingUnitFormModal,
  UnitDetail,
  BuildingManager,
  AutomaticUnitEditor,
  UnitDeleteConfirmation,
  getUnitLabel
} from '@/entities/property';
import { getUnitManagementError } from '@/features/unit-management';
import type { UnitListController } from '../../_hooks/useUnitList';
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
        <UnitDetail
          unit={detailUnit}
          residentSummary={data.residentSummaries?.[detailUnit.clientId]}
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
          minimumBuildingCount={1}
          deletionDescription={'연결된 세대와 주민을 삭제하고 주민 이용 권한을 종료합니다. 당월 청구는 취소하며 과거 부과 이력은 유지합니다.'}
          buildings={data.buildings}
          units={data.units}
          busy={buildingMutation.isPending}
          errorMessage={buildingMutation.isError ? getUnitManagementError(buildingMutation.error) : ''}
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
          errorMessage={automaticMutation.isError ? getUnitManagementError(automaticMutation.error) : ''}
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
          errorMessage={unitMutation.isError ? getUnitManagementError(unitMutation.error) : ''}
          onSaveUnit={(unit) => unitMutation.mutate({
            unit,
            editingId: dialog.target.clientId
          })}
          onClose={() => controller.setDialog(null)}
        />
      )}
      {controller.pendingUnit && (
        <UnitDeleteConfirmation
          description={'연결된 주민을 삭제하고 주민 이용 권한을 종료합니다. 당월 청구는 취소하며 과거 부과 이력은 유지합니다.'}
          label={'1세대'}
          fallbackFocusRef={controller.listTitleRef}
          busy={deleteMutation.isPending}
          errorMessage={deleteMutation.isError ? getUnitManagementError(deleteMutation.error) : ''}
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
