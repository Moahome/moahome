'use client';

import {
  useRef,
  useState
} from 'react';
import { UNIT_STATUS_OPTIONS } from '@/entities/property';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  getFloorLabel,
  getUnitLabel,
  type BuildingDraft,
  type UnitDraft
} from '../../../model/unitSetup';
import {
  getSortedBuildings,
  getSortedUnits
} from '../../_utils/setupSorting';
import { UnitDeleteConfirmation } from '../unit-delete-confirmation/unitDeleteConfirmation';
import styles from './unitList.module.css';

/** 한 목록을 PC 표와 모바일 카드로 표시하며 호수·표시 이름 검색과 동별 필터를 적용합니다. */
export function UnitList({
  hasBuildings,
  buildings,
  units,
  onManageBuildings,
  onEdit,
  onDelete,
  onDeleteSelected,
  onAdd,
  onAutomaticAdd,
}: {
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  onManageBuildings: () => void;
  onEdit: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onDeleteSelected: (clientIds: string[]) => void;
  onAdd: (buildingClientId?: string) => void;
  onAutomaticAdd: (buildingClientId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<{ scope: string; ids: string[] } | null>(null);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  // 삭제되거나 연결을 해제한 동의 필터 때문에 남은 세대가 숨겨지지 않게 합니다.
  const activeBuildingFilter = hasBuildings && buildings.some((building) => building.clientId === buildingFilter) ? buildingFilter : '';
  const selectedBuilding = buildings.find((building) => building.clientId === activeBuildingFilter);
  const sortedBuildings = getSortedBuildings(buildings);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredUnits = getSortedUnits(units, buildings, hasBuildings).filter((unit) => (!activeBuildingFilter || unit.buildingClientId === activeBuildingFilter)
    && `${unit.unitNumber} ${getUnitLabel(unit)}`.toLocaleLowerCase().includes(normalizedQuery));
  // 화면 밖으로 숨겨진 항목이나 이미 삭제된 ID는 선택과 확인 대상에 포함하지 않습니다.
  const scope = JSON.stringify([hasBuildings, activeBuildingFilter, query]);
  const isSelecting = selection?.scope === scope;
  const selectedUnits = isSelecting ? filteredUnits.filter((unit) => selection.ids.includes(unit.clientId)) : [];
  const pendingUnits = pendingIds ? filteredUnits.filter((unit) => pendingIds.includes(unit.clientId)) : [];

  /** 동 또는 검색 변경 시 선택 모드는 유지하되 이전 범위의 선택을 모두 비웁니다. */
  function changeFilter(nextBuildingFilter: string, nextQuery: string) {
    if (nextBuildingFilter === activeBuildingFilter && nextQuery === query) return;

    setBuildingFilter(nextBuildingFilter);
    setQuery(nextQuery);
    setSelection((previous) => previous ? {
      scope: JSON.stringify([hasBuildings, nextBuildingFilter, nextQuery]),
      ids: []
    } : null);
    setPendingIds(null);
  }

  /** 현재 목록의 초안 ID로 개별 선택을 토글하므로 같은 호수가 다른 동에 있어도 구분합니다. */
  function toggleUnit(clientId: string) {
    const ids = selectedUnits.map((unit) => unit.clientId);
    setSelection({
      scope,
      ids: ids.includes(clientId) ? ids.filter((id) => id !== clientId) : [...ids, clientId]
    });
  }

  /** 확인 창에 표시한 현재 목록의 세대만 삭제한 뒤 선택 모드를 종료합니다. */
  function confirmSelectedDeletion() {
    if (!pendingUnits.length) return;

    onDeleteSelected(pendingUnits.map((unit) => unit.clientId));
    setPendingIds(null);
    setSelection(null);
  }

  return (
    <>
      {hasBuildings && (
        <section
          className={styles.buildings}
          aria-label={'동 선택'}
        >
          <div
            className={styles['building-heading']}
          >
            <h3>
              동 선택
            </h3>
            <Button
              variant={'text'}
              size={'sm'}
              onClick={onManageBuildings}
              trailingIcon={(
                <ServiceIcon
                  name={'settings'}
                />
              )}
            >
              동 관리
            </Button>
          </div>
          <div
            className={styles['building-options']}
            role={'group'}
            aria-label={'동별 보기'}
          >
            <Button
              variant={activeBuildingFilter ? 'ghost' : 'primary'}
              aria-pressed={!activeBuildingFilter}
              onClick={() => changeFilter('', query)}
            >
              전체
            </Button>
            {sortedBuildings.map((building) => (
              <Button
                key={building.clientId}
                variant={activeBuildingFilter === building.clientId ? 'primary' : 'ghost'}
                aria-pressed={activeBuildingFilter === building.clientId}
                onClick={() => changeFilter(building.clientId, query)}
              >
                <span
                  className={styles['chip-icon']}
                  aria-hidden={'true'}
                >
                  <ServiceIcon
                    name={'building'}
                  />
                </span>
                {building.name}
              </Button>
            ))}
          </div>
        </section>
      )}
      <div
        className={styles['unit-list']}
      >
        <div
          className={styles.toolbar}
        >
          <Input
            aria-label={'호수 검색'}
            placeholder={'호수로 검색하세요.'}
            value={query}
            onChange={(event) => changeFilter(activeBuildingFilter, event.target.value)}
            fieldClassName={styles.search}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
          />
          <Button
            variant={'outline'}
            className={styles['desktop-automatic']}
            onClick={() => onAutomaticAdd(activeBuildingFilter || undefined)}
            disabled={hasBuildings && !buildings.length}
          >
            세대 자동 입력
          </Button>
          <Button
            variant={'outline'}
            className={styles['desktop-add']}
            onClick={() => onAdd(activeBuildingFilter || undefined)}
            disabled={hasBuildings && !buildings.length}
            leadingIcon={(
              <ServiceIcon
                name={'plus'}
              />
            )}
          >
            세대 추가
          </Button>
        </div>
        <div
          className={styles['list-heading']}
        >
          <p
            className={styles.summary}
            role={'status'}
          >
            <strong>
              {selectedBuilding?.name ?? (hasBuildings ? '전체 동' : '전체 세대')}
            </strong>
            {' · 총 '}
            {filteredUnits.length}
            세대
          </p>
          <Button
            ref={editButtonRef}
            variant={'text'}
            size={'sm'}
            aria-pressed={isSelecting}
            disabled={!filteredUnits.length && !isSelecting}
            onClick={() => setSelection(isSelecting ? null : {
              scope,
              ids: []
            })}
          >
            {isSelecting ? '완료' : '편집'}
          </Button>
        </div>
        {isSelecting && (
          <div
            className={styles['selection-bar']}
          >
            <label
              className={styles['select-all']}
            >
              <input
                type={'checkbox'}
                aria-label={'현재 목록 전체 선택'}
                checked={filteredUnits.length > 0 && selectedUnits.length === filteredUnits.length}
                ref={(element) => {
                  if (element) element.indeterminate = selectedUnits.length > 0 && selectedUnits.length < filteredUnits.length;
                }}
                disabled={!filteredUnits.length}
                onChange={(event) => setSelection({
                  scope,
                  ids: event.target.checked ? filteredUnits.map((unit) => unit.clientId) : []
                })}
              />
              전체 선택
            </label>
            <span
              role={'status'}
            >
              {selectedUnits.length}
              세대 선택
            </span>
            <Button
              variant={'outline'}
              size={'sm'}
              className={styles['selection-delete']}
              disabled={!selectedUnits.length}
              onClick={() => setPendingIds(selectedUnits.map((unit) => unit.clientId))}
            >
              선택한
              {' '}
              {selectedUnits.length}
              세대 삭제
            </Button>
          </div>
        )}
        {filteredUnits.length ? (
          <table
            className={styles.table}
            aria-label={'등록할 세대 목록'}
            role={'table'}
            data-selecting={isSelecting}
          >
            <thead
              role={'rowgroup'}
            >
              <tr
                role={'row'}
              >
                <th
                  scope={'col'}
                >
                  호수
                </th>
                {hasBuildings && (
                  <th
                    scope={'col'}
                  >
                    동
                  </th>
                )}
                <th
                  scope={'col'}
                >
                  층
                </th>
                <th
                  scope={'col'}
                >
                  상태
                </th>
                <th
                  scope={'col'}
                >
                  관리
                </th>
              </tr>
            </thead>
            <tbody
              role={'rowgroup'}
            >
              {filteredUnits.map((unit) => {
                const label = getUnitLabel(unit);
                const buildingName = buildings.find((entry) => entry.clientId === unit.buildingClientId)?.name;
                const statusLabel = UNIT_STATUS_OPTIONS.find((option) => option.value === unit.status)?.label ?? '상태 재선택';

                return (
                  <tr
                    key={unit.clientId}
                    role={'row'}
                  >
                    <td
                      className={styles.identity}
                      role={'cell'}
                    >
                      {isSelecting && (
                        <input
                          className={styles['selection-checkbox']}
                          type={'checkbox'}
                          aria-label={[hasBuildings ? buildingName : null, label, '선택'].filter(Boolean).join(' ')}
                          checked={selectedUnits.some((selected) => selected.clientId === unit.clientId)}
                          onChange={() => toggleUnit(unit.clientId)}
                        />
                      )}
                      <span
                        className={styles['unit-icon']}
                      >
                        <ServiceIcon
                          name={'building'}
                        />
                      </span>
                      <span
                        className={styles['unit-name']}
                      >
                        <strong>
                          {label}
                        </strong>
                        <span
                          className={styles['mobile-details']}
                        >
                          {hasBuildings && !activeBuildingFilter ? `${buildingName ?? '동 미지정'} · ` : ''}
                          {unit.floor === null ? '층 미입력' : getFloorLabel(unit.floor)}
                        </span>
                      </span>
                    </td>
                    {hasBuildings && (
                      <td
                        className={styles['desktop-detail']}
                        role={'cell'}
                      >
                        {buildingName ?? '동 미지정'}
                      </td>
                    )}
                    <td
                      className={styles['desktop-detail']}
                      role={'cell'}
                    >
                      {unit.floor === null ? '—' : getFloorLabel(unit.floor)}
                    </td>
                    <td
                      className={styles['unit-status']}
                      role={'cell'}
                    >
                      <span
                        className={styles.badge}
                        data-status={unit.status}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td
                      className={styles['unit-actions']}
                      role={'cell'}
                    >
                      <div
                        className={styles['desktop-actions']}
                      >
                        <Button
                          variant={'ghost'}
                          size={'sm'}
                          tone={'success'}
                          iconOnly
                          aria-label={`${label} 수정`}
                          title={'수정'}
                          onClick={() => onEdit(unit.clientId)}
                          leadingIcon={(
                            <ServiceIcon
                              name={'pen'}
                            />
                          )}
                        />
                        <Button
                          variant={'ghost'}
                          size={'sm'}
                          tone={'danger'}
                          iconOnly
                          aria-label={`${label} 삭제`}
                          title={'삭제'}
                          onClick={() => onDelete(unit.clientId)}
                          leadingIcon={(
                            <ServiceIcon
                              name={'trash'}
                            />
                          )}
                        />
                      </div>
                      <Button
                        variant={'text'}
                        size={'sm'}
                        className={styles['mobile-edit']}
                        aria-label={`${label} 수정`}
                        onClick={() => onEdit(unit.clientId)}
                        trailingIcon={(
                          <ServiceIcon
                            name={'chevron'}
                            direction={'right'}
                          />
                        )}
                      >
                        수정
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div
            className={styles.empty}
          >
            <ServiceIcon
              name={'building'}
            />
            <h3>
              {normalizedQuery ? '검색 결과가 없어요.' : '아직 등록한 세대가 없어요.'}
            </h3>
            <p>
              {normalizedQuery ? '다른 호수로 검색하거나 동 선택을 해제해주세요.' : '세대 추가를 눌러 관리할 세대를 등록해주세요.'}
            </p>
          </div>
        )}
      </div>
      <Button
        variant={'outline'}
        size={'lg'}
        className={styles['mobile-automatic']}
        onClick={() => onAutomaticAdd(activeBuildingFilter || undefined)}
        disabled={hasBuildings && !buildings.length}
      >
        세대 자동 입력
      </Button>
      {pendingIds && pendingUnits.length > 0 && (
        <UnitDeleteConfirmation
          title={'선택한 세대 삭제 확인'}
          label={`선택한 ${pendingUnits.length}세대`}
          description={'아래 세대만 삭제됩니다. 동과 선택하지 않은 세대는 유지됩니다.'}
          fallbackFocusRef={editButtonRef}
          onConfirm={confirmSelectedDeletion}
          onClose={() => setPendingIds(null)}
        >
          <ul
            className={styles['delete-targets']}
            aria-label={'삭제할 세대'}
          >
            {pendingUnits.map((unit) => (
              <li
                key={unit.clientId}
              >
                {[hasBuildings ? buildings.find((building) => building.clientId === unit.buildingClientId)?.name : null, getUnitLabel(unit)].filter(Boolean).join(' ')}
              </li>
            ))}
          </ul>
        </UnitDeleteConfirmation>
      )}
      <Button
        variant={'outline'}
        size={'lg'}
        className={styles['mobile-add']}
        onClick={() => onAdd(activeBuildingFilter || undefined)}
        disabled={hasBuildings && !buildings.length}
        leadingIcon={(
          <ServiceIcon
            name={'plus'}
          />
        )}
      >
        세대 추가
      </Button>
    </>
  );
}
