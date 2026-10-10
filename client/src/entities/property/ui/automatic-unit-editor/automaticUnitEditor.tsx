'use client';

import {
  useRef,
  useState,
  type FormEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import {
  getAutomaticUnitPreview,
  type AutomaticUnitRule
} from '../../model/automaticUnits';
import {
  getFloorLabel,
  type BuildingDraft,
  type UnitDraft
} from '../../model/unitForm';
import { getSortedBuildings } from '../../model/unitSorting';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './automaticUnitEditor.module.css';

const RULE_FIELDS = [
  {
    name: 'startFloor',
    label: '시작 층',
    placeholder: '예) 2',
    min: -32768,
    max: 32767
  },
  {
    name: 'endFloor',
    label: '마지막 층',
    placeholder: '예) 6',
    min: -32768,
    max: 32767
  },
  {
    name: 'unitsPerFloor',
    label: '층당 세대 수',
    placeholder: '예) 2',
    min: 1,
    max: 99
  },
] as const;

/** 생성 규칙을 초안에 유지하고 선택 동의 미리보기·중복 제외를 확인한 뒤 일괄 추가를 요청합니다. */
export function AutomaticUnitEditor({
  rule,
  hasBuildings,
  buildings,
  units,
  initialBuildingClientId,
  onRuleChange,
  onAdd,
  onClose,
  busy = false,
  errorMessage = '',
}: {
  rule: AutomaticUnitRule;
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  initialBuildingClientId?: string;
  onRuleChange: (rule: AutomaticUnitRule) => void;
  onAdd: (buildingClientId: string | null) => void;
  onClose: () => void;
  busy?: boolean;
  errorMessage?: string;
}) {
  const startFloorRef = useRef<HTMLInputElement>(null);
  const [buildingClientId, setBuildingClientId] = useState(initialBuildingClientId ?? (buildings.length === 1 ? buildings[0].clientId : ''));
  const selectedBuildingId = hasBuildings ? buildingClientId : null;
  const preview = getAutomaticUnitPreview(rule, selectedBuildingId, hasBuildings, buildings, units);
  const sortedBuildings = getSortedBuildings(buildings);
  const canAdd = preview.newCount > 0 && Object.keys(preview.errors).length === 0;

  /** 잘못된 규칙이나 전체 중복에는 기존 입력을 유지하고 추가 시 부모에서 현재 목록을 다시 검증합니다. */
  function submitUnits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canAdd) return;

    onAdd(selectedBuildingId);
  }

  return (
    <ClientModal
      initialFocusRef={startFloorRef}
      onClose={onClose}
      busy={busy}
      className={styles.dialog}
      aria-labelledby={'automatic-unit-title'}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'automatic-unit-title'}
        >
          세대 자동 입력
        </h2>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'세대 자동 입력 닫기'}
          disabled={busy}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <p
        className={styles.description}
      >
        층 번호에 두 자리 순번을 붙여 호수를 만듭니다.
        <span>
          예) 2~6층, 층당 2세대 → 201·202호부터 601·602호까지
        </span>
        <span>
          지하층은 음수로 입력하며 -1층은 B101호처럼 생성합니다. 0층은 제외합니다.
        </span>
      </p>
      <form
        onSubmit={submitUnits}
        noValidate
      >
        <fieldset
          className={styles.controls}
          disabled={busy}
        >
          {hasBuildings && (
            <Dropdown
              label={'추가할 동'}
              placeholder={'동을 선택해주세요'}
              options={sortedBuildings.map((building) => ({
                value: building.clientId,
                label: building.name
              }))}
              value={buildingClientId}
              onChange={setBuildingClientId}
              required
            />
          )}
          <div
            className={styles.fields}
          >
            {RULE_FIELDS.map((field) => (
              <Input
                key={field.name}
                ref={field.name === 'startFloor' ? startFloorRef : undefined}
                label={field.label}
                type={'number'}
                step={1}
                min={field.min}
                max={field.max}
                placeholder={field.placeholder}
                value={rule[field.name]}
                onChange={(event) => onRuleChange({
                  ...rule,
                  [field.name]: event.target.value
                })}
                error={rule[field.name] ? preview.errors[field.name] : undefined}
                fieldClassName={field.name === 'unitsPerFloor' ? styles['count-field'] : undefined}
                required
              />
            ))}
          </div>
          <p
            className={styles.hint}
          >
            층당 1~99세대, 한 번에 최대 1,000세대까지 추가할 수 있어요.
            생성 규칙은 다른 동에서도 다시 사용할 수 있어요.
          </p>
          <section
            className={styles.preview}
            aria-labelledby={'automatic-preview-title'}
          >
            <h3
              id={'automatic-preview-title'}
            >
              미리보기
            </h3>
            {preview.entries.length ? (
              <>
                <p
                  className={styles.summary}
                  role={'status'}
                >
                  총
                  {' '}
                  {preview.entries.length}
                  세대 · 추가
                  {' '}
                  {preview.newCount}
                  세대 · 중복 제외
                  {' '}
                  {preview.duplicateCount}
                  세대
                </p>
                <div
                  className={styles['preview-scroll']}
                  tabIndex={0}
                  role={'region'}
                  aria-label={'생성될 세대 목록 스크롤'}
                >
                  <table
                    aria-label={'생성될 세대 미리보기'}
                  >
                    <thead>
                      <tr>
                        <th
                          scope={'col'}
                        >
                          호수
                        </th>
                        <th
                          scope={'col'}
                        >
                          층
                        </th>
                        <th
                          scope={'col'}
                        >
                          처리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.entries.map((entry) => (
                        <tr
                          key={entry.unitNumber}
                          data-duplicate={entry.isDuplicate}
                        >
                          <td>
                            {entry.unitNumber}
                            호
                          </td>
                          <td>
                            {getFloorLabel(entry.floor)}
                          </td>
                          <td>
                            {entry.isDuplicate ? '중복 제외' : '추가'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p
                  className={styles.hint}
                >
                  같은 동에 이미 있는 호수는 제외하며 기존 입력은 유지합니다.
                  새 세대의 상태는 사용중으로 설정됩니다.
                </p>
              </>
            ) : (
              <p
                className={styles.empty}
              >
                {hasBuildings ? '동과 층 범위를 입력하면 생성될 세대를 확인할 수 있어요.' : '층 범위를 입력하면 생성될 세대를 확인할 수 있어요.'}
              </p>
            )}
          </section>
          {errorMessage && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {errorMessage}
            </p>
          )}
          <footer
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={onClose}
            >
              취소
            </Button>
            <Button
              type={'submit'}
              disabled={!canAdd}
            >
              {busy ? '저장 중…' : '추가'}
            </Button>
          </footer>
        </fieldset>
      </form>
    </ClientModal>
  );
}
