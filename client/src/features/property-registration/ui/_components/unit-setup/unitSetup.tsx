'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { HomeIllustration } from '@/shared/ui/home-illustration';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  createAutomaticUnits,
  type AutomaticUnitRule
} from '../../../model/automaticUnits';
import type { BasicInfoDraft } from '../../../model/basicInfo';
import {
  getUnitSetupError,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '../../../model/unitSetup';
import {
  BuildingUnitFormModal,
  type BuildingUnitFormTarget
} from '@/entities/property';
import { AutomaticUnitEditor } from '../automatic-unit-editor/automaticUnitEditor';
import { BuildingManager } from '../building-manager/buildingManager';
import { UnitDeleteConfirmation } from '../unit-delete-confirmation/unitDeleteConfirmation';
import { SetupProgress } from '../setup-progress/setupProgress';
import { UnitList } from '../unit-list/unitList';
import styles from './unitSetup.module.css';

/** 같은 동·세대 초안을 PC 표와 모바일 카드로 표시하고 검색·편집·이전 이동을 연결합니다. */
export function UnitSetup({
  basicInfo,
  buildings,
  units,
  automaticUnitRule,
  onAutomaticRuleChange,
  onChange,
  onPrevious,
  onNext,
}: {
  basicInfo: BasicInfoDraft;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  automaticUnitRule: AutomaticUnitRule;
  onAutomaticRuleChange: (rule: AutomaticUnitRule) => void;
  onChange: (buildings: BuildingDraft[], units: UnitDraft[]) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasBuildings = basicInfo.hasBuildings === true;
  const [automaticTarget, setAutomaticTarget] = useState<{ buildingClientId?: string } | null>(null);
  const [editing, setEditing] = useState<BuildingUnitFormTarget | null>(null);
  const [isManagingBuildings, setIsManagingBuildings] = useState(false);
  const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
  const pendingUnit = units.find((unit) => unit.clientId === pendingUnitId);
  const pendingBuilding = buildings.find((building) => building.clientId === pendingUnit?.buildingClientId);
  const setupError = getUnitSetupError(hasBuildings, buildings, units);
  const hasOldBuildings = !hasBuildings && (buildings.length > 0 || units.some((unit) => unit.buildingClientId !== null));

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  /** 초안의 기존 위치를 유지해 수정이 초안 순서를 바꾸거나 새 식별자를 만들지 않게 합니다. */
  function saveBuilding(building: BuildingDraft) {
    const exists = buildings.some((entry) => entry.clientId === building.clientId);
    const nextBuildings = exists ? buildings.map((entry) => entry.clientId === building.clientId ? building : entry) : [...buildings, building];
    onChange(nextBuildings, units);
    setEditing(null);
  }

  /** 세대 추가와 수정은 초안에만 반영하며 다음 안내는 입력이 바뀌면 다시 확인하게 합니다. */
  function saveUnit(unit: UnitDraft) {
    const exists = units.some((entry) => entry.clientId === unit.clientId);
    const nextUnits = exists ? units.map((entry) => entry.clientId === unit.clientId ? unit : entry) : [...units, unit];
    onChange(buildings, nextUnits);
    setEditing(null);
  }

  /** 확인 시점의 목록으로 중복을 다시 제외하고 생성한 세대 전체를 한 번에 초안에 반영합니다. */
  function addAutomaticUnits(buildingClientId: string | null) {
    const generated = createAutomaticUnits(automaticUnitRule, buildingClientId, hasBuildings, buildings, units);
    if (!generated.length) return;

    onChange(buildings, [...units, ...generated]);
    setAutomaticTarget(null);
  }

  /** 연결된 세대가 있는 동은 유지해 초안의 세대 소속이 사라지지 않게 합니다. */
  function deleteBuilding(clientId: string) {
    if (units.some((unit) => unit.buildingClientId === clientId)) {
      return '연결된 세대가 있어요. 세대를 다른 동으로 옮기거나 삭제한 뒤 다시 시도해주세요.';
    }

    onChange(buildings.filter((entry) => entry.clientId !== clientId), units);
    return null;
  }

  /** PC 목록과 모바일 편집 창에서 같은 세대 초안을 제거하고 다음 단계 조건을 다시 확인합니다. */
  function deleteUnit(clientId: string) {
    onChange(buildings, units.filter((entry) => entry.clientId !== clientId));
  }

  /** 삭제 확인 후 동과 연결 세대를 한 번에 제거하고 다른 동의 세대와 자동 입력 규칙을 보존합니다. */
  function deleteBuildingWithUnits(clientId: string) {
    onChange(buildings.filter((building) => building.clientId !== clientId), units.filter((unit) => unit.buildingClientId !== clientId));
  }

  /** 목록에서 확인한 초안 ID만 제거하며 선택하지 않은 세대와 동은 보존합니다. */
  function deleteSelectedUnits(clientIds: string[]) {
    const selectedIds = new Set(clientIds);
    onChange(buildings, units.filter((unit) => !selectedIds.has(unit.clientId)));
  }

  /** 초안 항목만 제거하고 동 삭제의 참조 검증은 관리 창과 편집 창에서 공유합니다. */
  function deleteEntry() {
    if (!editing?.clientId) return null;

    if (editing.kind === 'building') {
      const failure = deleteBuilding(editing.clientId);

      if (failure) return failure;
    } else {
      setPendingUnitId(editing.clientId);
      return null;
    }

    setEditing(null);
    return null;
  }

  /** 삭제 확인 전에는 초안을 유지하며 확인한 세대만 제거하고 해당 편집 창도 닫습니다. */
  function confirmUnitDeletion() {
    if (!pendingUnitId) return;

    deleteUnit(pendingUnitId);
    if (editing?.kind === 'unit' && editing.clientId === pendingUnitId) setEditing(null);
    setPendingUnitId(null);
  }

  /** 동 없음 변경을 사용자가 확인한 경우에만 동 연결을 해제하고 세대 입력 자체는 유지합니다. */
  function detachBuildings() {
    onChange([], units.map((unit) => ({
      ...unit,
      buildingClientId: null
    })));
  }

  /** 동·세대 초안이 유효할 때만 관리계좌 설정으로 이동하며 업무 데이터를 저장하지 않습니다. */
  function continueSetup() {
    if (setupError) return;

    onNext();
  }

  return (
    <main
      className={styles.page}
    >
      <div
        className={styles['mobile-navigation']}
      >
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'기본 정보로 돌아가기'}
          onClick={onPrevious}
          leadingIcon={(
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
            />
          )}
        />
        <span>
          초기 설정
        </span>
      </div>
      <header
        className={styles['setup-heading']}
      >
        <h1>
          <span>
            {basicInfo.name}
            {' 초기 설정'}
          </span>
          <HomeIllustration
            kind={'create'}
            showAction={false}
          />
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={2}
      />
      <section
        className={styles.card}
        aria-labelledby={'unit-setup-title'}
      >
        <header
          className={styles.intro}
        >
          <div
            className={styles['intro-illustration']}
          >
            <HomeIllustration
              kind={'create'}
              showAction={false}
            />
          </div>
          <div
            className={styles['intro-copy']}
          >
            <h2
              id={'unit-setup-title'}
              ref={headingRef}
              tabIndex={-1}
            >
              동·세대 설정
            </h2>
            <p>
              관리할 세대를 등록해주세요.
              <span>
                {hasBuildings ? ' 동별로 세대를 등록할 수 있습니다.' : ' 동이 없는 건물은 호수만 등록하면 됩니다.'}
              </span>
            </p>
            <span
              className={styles['building-badge']}
            >
              <ServiceIcon
                name={'building'}
              />
              {hasBuildings ? '동 구분 있음' : '동 구분 없음'}
            </span>
          </div>
          <div
            className={styles['mobile-illustration']}
          >
            <HomeIllustration
              kind={'create'}
              showAction={false}
            />
          </div>
        </header>
        {hasOldBuildings && (
          <aside
            className={styles['structure-notice']}
          >
            <p>
              동 구분을 없음으로 변경했어요. 동 연결을 해제하면 등록한 호수와 층 정보는 유지됩니다.
            </p>
            <Button
              variant={'outline'}
              size={'sm'}
              onClick={detachBuildings}
            >
              동 연결 해제
            </Button>
          </aside>
        )}
        <UnitList
          hasBuildings={hasBuildings}
          buildings={buildings}
          units={units}
          onManageBuildings={() => setIsManagingBuildings(true)}
          onDelete={setPendingUnitId}
          onDeleteSelected={deleteSelectedUnits}
          onAutomaticAdd={(buildingClientId) => setAutomaticTarget({
            buildingClientId
          })}
          onEdit={(clientId) => setEditing({
            kind: 'unit',
            clientId
          })}
          onAdd={(buildingClientId) => setEditing({
            kind: 'unit',
            clientId: null,
            buildingClientId
          })}
        />
        <aside
          className={styles.notice}
        >
          <span
            className={styles['notice-icon']}
          >
            <ServiceIcon
              name={'info'}
            />
          </span>
          <p>
            <strong>
              세대 정보는 나중에도 수정할 수 있어요.
            </strong>
            <span>
              등록한 세대 정보는 이후에도 언제든지 추가, 수정, 삭제할 수 있습니다.
            </span>
          </p>
        </aside>
        {setupError && units.length > 0 && (
          <p
            className={styles.error}
            role={'alert'}
          >
            {setupError}
          </p>
        )}
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            size={'lg'}
            onClick={onPrevious}
          >
            이전
          </Button>
          <Button
            size={'lg'}
            disabled={Boolean(setupError)}
            onClick={continueSetup}
            trailingIcon={(
              <ServiceIcon
                name={'chevron'}
                direction={'right'}
              />
            )}
          >
            다음
          </Button>
        </footer>
      </section>
      {automaticTarget && (
        <AutomaticUnitEditor
          rule={automaticUnitRule}
          hasBuildings={hasBuildings}
          buildings={buildings}
          units={units}
          initialBuildingClientId={automaticTarget.buildingClientId}
          onRuleChange={onAutomaticRuleChange}
          onAdd={addAutomaticUnits}
          onClose={() => setAutomaticTarget(null)}
        />
      )}
      {pendingUnit && (
        <UnitDeleteConfirmation
          label={[hasBuildings ? pendingBuilding?.name : null, getUnitLabel(pendingUnit)].filter(Boolean).join(' ')}
          onConfirm={confirmUnitDeletion}
          onClose={() => setPendingUnitId(null)}
        />
      )}
      {isManagingBuildings && hasBuildings && (
        <BuildingManager
          buildings={buildings}
          units={units}
          onSave={saveBuilding}
          onDelete={deleteBuildingWithUnits}
          onClose={() => setIsManagingBuildings(false)}
        />
      )}
      {editing && (
        <BuildingUnitFormModal
          key={`${editing.kind}-${editing.clientId ?? 'new'}`}
          target={editing}
          hasBuildings={hasBuildings}
          buildings={buildings}
          units={units}
          onSaveBuilding={saveBuilding}
          onSaveUnit={saveUnit}
          onDelete={deleteEntry}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
