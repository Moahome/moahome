'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  BuildingUnitFormModal,
  UnitDetail,
  UnitDeleteConfirmation,
  BuildingManager,
  AutomaticUnitEditor,
  EMPTY_AUTOMATIC_UNIT_RULE,
  createAutomaticUnits,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '@/entities/property';
import {
  getUnits,
  saveUnit,
  saveBuilding,
  saveUnits,
  deleteBuilding,
  deleteUnits,
  getUnitManagementError
} from '@/features/unit-management';
import { Button } from '@/shared/ui/button';
import { isServerConnectionError } from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import { Toast } from '@/shared/ui/toast';
import styles from './unitEntryPage.module.css';

/** 모바일의 세대 등록·상세·수정·동 관리·자동 입력을 독립 주소에서 제공하고 기존 입력과 API를 재사용합니다. */
export function UnitEntryPage({
  propertyId,
  mode,
  unitId,
  buildingId
}: {
  propertyId: string;
  mode: 'create' | 'detail' | 'edit' | 'buildings' | 'automatic';
  unitId?: string;
  buildingId?: string;
}) {
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const queryKey = ['property-units', session.data?.id, propertyId];
  const listPath = `/manage/${propertyId}/households`;
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [automaticRule, setAutomaticRule] = useState(EMPTY_AUTOMATIC_UNIT_RULE);
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
  const list = useQuery({
    queryKey,
    queryFn: () => getUnits(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false
  });
  const save = useMutation({
    mutationFn: (unit: UnitDraft) => saveUnit(propertyId, unit, mode === 'edit' ? unitId ?? null : null),
    retry: false,
    onSuccess: () => finish(mode === 'edit' ? 'updated' : 'added')
  });
  const deletion = useMutation({
    mutationFn: () => deleteUnits(propertyId, [unitId!]),
    retry: false,
    onSuccess: () => finish('deleted')
  });
  const buildingMutation = useMutation({
    mutationFn: (command: { kind: 'save'; building: BuildingDraft } | { kind: 'delete'; buildingId: string }) => {
      if (command.kind === 'delete') return deleteBuilding(propertyId, command.buildingId);
      const editingId = list.data?.buildings.some((entry) => entry.clientId === command.building.clientId) ? command.building.clientId : null;

      return saveBuilding(propertyId, command.building, editingId);
    },
    retry: false,
    onSuccess: async (_result, command) => {
      await queryClient.invalidateQueries({
        queryKey
      });
      setNotice({
        id: crypto.randomUUID(),
        message: command.kind === 'delete' ? '동과 연결된 세대를 삭제했어요.' : '동 정보를 저장했어요.'
      });
    }
  });
  const automaticMutation = useMutation({
    mutationFn: (units: UnitDraft[]) => saveUnits(propertyId, units),
    retry: false,
    onSuccess: () => finish('added')
  });

  /** 동 관리의 저장·삭제 실패는 호출 폼과 확인 창을 유지하고 성공한 경우에만 목록 상태로 전환합니다. */
  async function executeBuildingCommand(command: Parameters<typeof buildingMutation.mutateAsync>[0]) {
    if (buildingMutation.isPending) return false;
    try {
      await buildingMutation.mutateAsync(command);
      return true;
    } catch {
      return false;
    }
  }

  /** 완료 후 목록에서 다시 조회하도록 캐시를 무효화하고 입력 페이지를 목록으로 교체합니다. */
  async function finish(result: string) {
    await queryClient.invalidateQueries({
      queryKey,
      refetchType: 'none'
    });
    router.replace(`${listPath}?saved=${result}`);
  }

  /** 수정 취소는 상세로, 신규 입력 취소와 상세 닫기는 목록으로 이동합니다. */
  function closePage() {
    router.replace(mode === 'edit' ? `${listPath}/${unitId}` : listPath);
  }

  if (list.isPending) return (
    <p
      role={'status'}
    >
      세대 정보를 불러오고 있어요.
    </p>
  );
  if (list.isError && isServerConnectionError(list.error)) return (
    <ServerConnectionError
      onRetry={() => { void list.refetch({
        cancelRefetch: false
      }); }}
    />
  );
  if (list.isError) return (
    <section
      className={styles.state}
      role={'alert'}
    >
      <h1>
        세대 정보를 불러오지 못했어요.
      </h1>
      <p>
        {getUnitManagementError(list.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => void list.refetch()}
      >
        다시 시도
      </Button>
    </section>
  );

  const data = list.data;
  const unit = data.units.find((entry) => entry.clientId === unitId);
  const cannotCreate = (mode === 'create' || mode === 'automatic') && data.hasBuildings && !data.buildings.length;
  const cannotManageBuildings = mode === 'buildings' && !data.hasBuildings;
  if (((mode === 'detail' || mode === 'edit') && !unit) || cannotCreate || cannotManageBuildings || (mode === 'edit' && unit?.status === 'INACTIVE')) return (
    <section
      className={styles.state}
      role={'alert'}
    >
      <h1>
        {cannotManageBuildings ? '동 구분이 없는 관리대상이에요.' : cannotCreate ? '먼저 동을 등록해주세요.' : '세대를 확인할 수 없거나 수정할 수 없어요.'}
      </h1>
      {mode !== 'detail' && (
        <Button
          variant={'outline'}
          onClick={() => router.replace(listPath)}
        >
          세대 목록으로
        </Button>
      )}
    </section>
  );

  if (mode === 'buildings') return (
    <>
      <BuildingManager
        minimumBuildingCount={1}
        deletionDescription={'연결된 세대와 주민을 삭제하고 주민 이용 권한을 종료합니다. 당월 청구는 취소하며 과거 부과 이력은 유지합니다.'}
        presentation={'page'}
        buildings={data.buildings}
        units={data.units}
        onSave={(building) => executeBuildingCommand({
          kind: 'save',
          building
        })}
        onDelete={(buildingId) => executeBuildingCommand({
          kind: 'delete',
          buildingId
        })}
        onClose={closePage}
        busy={buildingMutation.isPending}
        errorMessage={buildingMutation.isError ? getUnitManagementError(buildingMutation.error) : ''}
      />
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );

  if (mode === 'automatic') return (
    <AutomaticUnitEditor
      presentation={'page'}
      rule={automaticRule}
      onRuleChange={setAutomaticRule}
      hasBuildings={data.hasBuildings}
      buildings={data.buildings}
      units={data.units}
      initialBuildingClientId={data.buildings.some((entry) => entry.clientId === buildingId) ? buildingId : undefined}
      onAdd={(selectedBuildingId) => {
        if (automaticMutation.isPending) return;
        const additions = createAutomaticUnits(automaticRule, selectedBuildingId, data.hasBuildings, data.buildings, data.units);
        if (additions.length) automaticMutation.mutate(additions);
      }}
      onClose={closePage}
      busy={automaticMutation.isPending}
      errorMessage={automaticMutation.isError ? getUnitManagementError(automaticMutation.error) : ''}
    />
  );

  if (mode !== 'detail') return (
    <BuildingUnitFormModal
      presentation={'page'}
      target={{
        kind: 'unit',
        clientId: mode === 'edit' ? unitId! : null,
        buildingClientId: data.buildings.some((building) => building.clientId === buildingId) ? buildingId : undefined
      }}
      hasBuildings={data.hasBuildings}
      buildings={data.buildings}
      units={data.units}
      onSaveUnit={(entry) => {
        if (!save.isPending) save.mutate(entry);
      }}
      onClose={closePage}
      busy={save.isPending}
      errorMessage={save.isError ? getUnitManagementError(save.error) : ''}
    />
  );

  if (!unit) return null;
  const buildingName = data.buildings.find((building) => building.clientId === unit.buildingClientId)?.name;

  return (
    <>
      <UnitDetail
        presentation={'page'}
        unit={unit}
        residentSummary={data.residentSummaries?.[unit.clientId]}
        buildingName={buildingName}
        hasBuildings={data.hasBuildings}
        onEdit={() => router.push(`${listPath}/${unit.clientId}/edit`)}
        onDelete={() => {
          deletion.reset();
          setConfirmingDeletion(true);
        }}
        busy={deletion.isPending}
        onClose={closePage}
      />
      {confirmingDeletion && (
        <UnitDeleteConfirmation
          description={'연결된 주민을 삭제하고 주민 이용 권한을 종료합니다. 당월 청구는 취소하며 과거 부과 이력은 유지합니다.'}
          label={'1세대'}
          busy={deletion.isPending}
          errorMessage={deletion.isError ? getUnitManagementError(deletion.error) : ''}
          onConfirm={() => {
            if (!deletion.isPending) deletion.mutate();
          }}
          onClose={() => setConfirmingDeletion(false)}
        >
          <p>
            {buildingName}
            {' '}
            {getUnitLabel({
              ...unit,
              displayName: null
            })}
          </p>
        </UnitDeleteConfirmation>
      )}
    </>
  );
}
