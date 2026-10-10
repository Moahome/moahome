import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  EMPTY_AUTOMATIC_UNIT_RULE,
  createAutomaticUnits,
  type BuildingDraft,
  type BuildingUnitFormTarget,
  type UnitDraft
} from '@/entities/property';
import { useSession } from '@/entities/session';
import {
  getUnits,
  saveUnit,
  saveBuilding,
  saveUnits,
  deleteUnits,
  deleteBuilding,
  type UnitList
} from '@/features/unit-management';
import {
  EMPTY_UNIT_LIST_FILTERS,
  getUnitListView,
  type UnitListFilters
} from '../../model/unitList';

type UnitListDialog = {
  kind: 'unit';
  target: BuildingUnitFormTarget;
} | {
  kind: 'buildings';
} | {
  kind: 'automatic';
} | {
  kind: 'detail';
  unitId: string;
} | null;
type BuildingCommand = {
  kind: 'save';
  building: BuildingDraft;
} | {
  kind: 'delete';
  buildingId: string;
};

const EMPTY_LIST: UnitList = {
  hasBuildings: false,
  buildings: [],
  units: [],
  residentSummaries: null
};

/** 조회·저장과 모달 상태를 관리하고 상세에서 선택한 한 세대만 확인 후 삭제합니다. */
export function useUnitList(propertyId: string, saved?: string) {
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const queryKey = ['property-units', session.data?.id, propertyId];
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
  const data = list.data ?? EMPTY_LIST;
  const [filters, setFilters] = useState(EMPTY_UNIT_LIST_FILTERS);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const savedMessages: Record<string, string> = {
    added: '세대를 추가했어요.',
    updated: '세대 정보를 수정했어요.',
    deleted: '세대를 삭제했어요.'
  };
  const savedMessage = saved && Object.hasOwn(savedMessages, saved) ? savedMessages[saved] : undefined;
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(() => savedMessage ? {
    id: 'page-save',
    message: savedMessage
  } : null);
  useEffect(() => {
    if (savedMessage) window.history.replaceState(window.history.state, '', `/manage/${propertyId}/households`);
  }, [propertyId, savedMessage]);
  const clearNotice = useCallback(() => setNotice(null), []);
  const [dialog, setDialog] = useState<UnitListDialog>(null);
  const [automaticRule, setAutomaticRule] = useState(EMPTY_AUTOMATIC_UNIT_RULE);
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const view = getUnitListView(data.units, data.buildings, data.hasBuildings, filters, page, pageSize);
  const pendingUnit = data.units.find((unit) => unit.clientId === pendingDeletion);

  const unitMutation = useMutation({
    mutationFn: ({
      unit,
      editingId
    }: {
      unit: UnitDraft;
      editingId: string | null;
    }) => saveUnit(propertyId, unit, editingId),
    retry: false,
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey
      });
      setDialog(null);
      notify(variables.editingId ? '세대 정보를 수정했어요.' : '세대를 추가했어요.');
    }
  });
  const buildingMutation = useMutation({
    mutationFn: (command: BuildingCommand) => {
      if (command.kind === 'delete') return deleteBuilding(propertyId, command.buildingId);
      const id = data.buildings.some((building) => building.clientId === command.building.clientId) ? command.building.clientId : null;

      return saveBuilding(propertyId, command.building, id);
    },
    retry: false,
    onSuccess: async (_result, command) => {
      await queryClient.invalidateQueries({
        queryKey
      });
      if (command.kind === 'delete') {
        setFilters((previous) => previous.buildingId === command.buildingId ? {
          ...previous,
          buildingId: ''
        } : previous);
        notify('동과 연결된 세대를 삭제했어요.');
        return;
      }
      notify('동 정보를 저장했어요.');
    }
  });
  const automaticMutation = useMutation({
    mutationFn: (units: UnitDraft[]) => saveUnits(propertyId, units),
    retry: false,
    onSuccess: async (_result, units) => {
      await queryClient.invalidateQueries({
        queryKey
      });
      setDialog(null);
      notify(`${units.length}세대를 추가했어요.`);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUnits(propertyId, [id]),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey
      });
      setPendingDeletion(null);
      setDialog(null);
      notify('세대를 삭제했어요.');
    }
  });

  /** 같은 내용의 성공도 새 알림으로 표시해 토스트의 자동 닫기 시간을 다시 시작합니다. */
  function notify(message: string) {
    setNotice({
      id: crypto.randomUUID(),
      message
    });
  }

  /** 모바일은 입력 페이지로 이동하고 데스크톱은 오류를 비운 모달에 현재 동을 기본값으로 전달합니다. */
  function openEditor(clientId: string | null) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      const path = clientId ? `${clientId}/edit` : 'new';
      router.push(`/manage/${propertyId}/households/${path}${!clientId && filters.buildingId ? `?buildingId=${filters.buildingId}` : ''}`);
      return;
    }
    unitMutation.reset();
    clearNotice();
    setDialog({
      kind: 'unit',
      target: {
        kind: 'unit',
        clientId,
        buildingClientId: filters.buildingId || undefined
      }
    });
  }

  /** 검색·동·상태 변경은 첫 페이지에서 시작합니다. */
  function changeFilters(next: UnitListFilters) {
    setFilters(next);
    setPage(1);
  }

  /** 목록 이동에 맞춰 현재 페이지를 갱신합니다. */
  function changePage(next: number) {
    setPage(next);
  }

  /** 상세에서 확인한 현재 세대만 삭제 대상으로 보관하며 실제 요청은 확인 후 실행합니다. */
  function requestDeletion(unitId: string) {
    if (!data.units.some((unit) => unit.clientId === unitId)) return;
    deleteMutation.reset();
    setPendingDeletion(unitId);
  }

  /** 공유 동 관리 모달이 저장 실패 시 입력·확인 창을 유지하도록 성공 여부를 반환합니다. */
  async function executeBuildingCommand(command: BuildingCommand) {
    try {
      await buildingMutation.mutateAsync(command);
      return true;
    } catch {
      return false;
    }
  }

  /** 미리보기와 같은 규칙으로 새 세대만 만들고 서버의 원자적 일괄 저장을 요청합니다. */
  function addAutomatic(buildingId: string | null) {
    const additions = createAutomaticUnits(automaticRule, buildingId, data.hasBuildings, data.buildings, data.units);
    if (additions.length) automaticMutation.mutate(additions);
  }

  return {
    list,
    data,
    view,
    filters,
    pageSize,
    notice,
    clearNotice,
    dialog,
    setDialog,
    automaticRule,
    setAutomaticRule,
    pendingUnit,
    listTitleRef,
    unitMutation,
    buildingMutation,
    automaticMutation,
    deleteMutation,
    openEditor,
    openDetail: (unitId: string) => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        router.push(`/manage/${propertyId}/households/${unitId}`);
        return;
      }
      setDialog({
        kind: 'detail',
        unitId
      });
    },
    changeFilters,
    changePage,
    requestDeletion,
    executeBuildingCommand,
    addAutomatic,
    changePageSize: (size: number) => {
      setPageSize(size);
      changePage(1);
    },
    closeDeletion: () => setPendingDeletion(null),
    openBuildings: () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        router.push(`/manage/${propertyId}/households/buildings`);
        return;
      }
      buildingMutation.reset();
      setDialog({
        kind: 'buildings'
      });
    },
    openAutomatic: () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        router.push(`/manage/${propertyId}/households/automatic${filters.buildingId ? `?buildingId=${filters.buildingId}` : ''}`);
        return;
      }
      automaticMutation.reset();
      setDialog({
        kind: 'automatic'
      });
    }
  };
}

export type UnitListController = ReturnType<typeof useUnitList>;
