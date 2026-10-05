'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { UNIT_STATUS_OPTIONS } from '@/entities/property';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import {
  getBuildingNameError,
  normalizeBuildingName,
  getUnitFormErrors,
  normalizeUnitForm,
  type BuildingDraft,
  type UnitDraft,
  type UnitForm,
  type UnitFormErrors,
  type UnitStatus
} from '../../../model/unitSetup';
import { getSortedBuildings } from '../../_utils/setupSorting';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import styles from './setupEditor.module.css';

export interface EditorTarget {
  kind: 'building' | 'unit';
  clientId: string | null;
  buildingClientId?: string;
}

/** 동·세대 초안만 추가·수정하고 서버 저장이나 기존 업무 데이터의 상태 변경은 수행하지 않습니다. */
export function SetupEditor({
  target,
  hasBuildings,
  buildings,
  units,
  onSaveBuilding,
  onSaveUnit,
  onDelete,
  onClose,
}: {
  target: EditorTarget;
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  onSaveBuilding: (building: BuildingDraft) => void;
  onSaveUnit: (unit: UnitDraft) => void;
  onDelete: () => string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const entryRef = useRef<HTMLInputElement>(null);
  const isBuilding = target.kind === 'building';
  const unit = units.find((entry) => entry.clientId === target.clientId);
  const building = buildings.find((entry) => entry.clientId === target.clientId);
  const sortedBuildings = getSortedBuildings(buildings);
  const title = `${isBuilding ? '동' : '세대'} ${target.clientId ? '수정' : '추가'}`;
  const [buildingName, setBuildingName] = useState(building?.name ?? '');
  const [form, setForm] = useState<UnitForm>({
    buildingClientId: unit?.buildingClientId ?? target.buildingClientId ?? (buildings.length === 1 ? buildings[0].clientId : ''),
    unitNumber: unit?.unitNumber ?? '',
    displayName: unit?.displayName ?? '',
    floor: unit?.floor === null || unit?.floor === undefined ? '' : String(unit.floor),
    status: unit?.status ?? 'ACTIVE',
  });
  const [errors, setErrors] = useState<UnitFormErrors>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    entryRef.current?.focus({
      preventScroll: true
    });
    document.body.style.overflow = 'hidden';

    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      // 모달을 DOM에서 제거해도 키보드 탐색이 편집 버튼에서 이어지도록 포커스를 돌려줍니다.
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({
          preventScroll: true
        });
      }
    };
  }, []);

  /** 오류는 필드에 연결하고 정리한 값만 전달하며 수정 시 같은 초안 ID를 유지합니다. */
  function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (isBuilding) {
      const name = normalizeBuildingName(buildingName);
      const failure = getBuildingNameError(name, buildings, target.clientId ?? undefined);

      if (failure) return setMessage(failure);

      onSaveBuilding({
        clientId: target.clientId ?? crypto.randomUUID(),
        name
      });
      return;
    }

    const nextErrors = getUnitFormErrors(form, hasBuildings, buildings, units, target.clientId ?? undefined);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) return;

    onSaveUnit(normalizeUnitForm(form, hasBuildings, target.clientId ?? crypto.randomUUID()));
  }

  /** 참조 중인 동은 삭제하지 않고 연결된 세대를 먼저 수정하도록 안내합니다. */
  function deleteEntry() {
    const failure = onDelete();

    if (failure) setMessage(failure);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'setup-editor-title'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'setup-editor-title'}
        >
          {title}
        </h2>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={`${title} 닫기`}
          onClick={onClose}
          leadingIcon={(
            <RegistrationIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        onSubmit={submitEntry}
        noValidate
      >
        <div
          className={styles.fields}
        >
          {isBuilding ? (
            <Input
              ref={entryRef}
              label={'동 이름'}
              placeholder={'예) 101동, A동'}
              value={buildingName}
              onChange={(event) => setBuildingName(event.target.value)}
              error={message || undefined}
              required
            />
          ) : (
            <>
              {hasBuildings && (
                <Dropdown
                  label={'동'}
                  placeholder={'동을 선택해주세요'}
                  options={sortedBuildings.map((entry) => ({
                    value: entry.clientId,
                    label: entry.name
                  }))}
                  value={form.buildingClientId}
                  onChange={(value) => setForm((previous) => ({
                    ...previous,
                    buildingClientId: value
                  }))}
                  error={errors.buildingClientId}
                  required
                />
              )}
              <div
                className={styles['number-row']}
              >
                <Input
                  ref={entryRef}
                  label={'호수'}
                  placeholder={'예) 201'}
                  value={form.unitNumber}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    unitNumber: event.target.value
                  }))}
                  error={errors.unitNumber}
                  required
                />
                <Input
                  label={'층'}
                  type={'number'}
                  step={1}
                  placeholder={'예) 2'}
                  value={form.floor}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    floor: event.target.value
                  }))}
                  error={errors.floor}
                  description={'선택사항'}
                />
              </div>
              <Input
                label={'표시 이름'}
                placeholder={'호수 대신 표시할 이름 (선택사항)'}
                value={form.displayName}
                onChange={(event) => setForm((previous) => ({
                  ...previous,
                  displayName: event.target.value
                }))}
                error={errors.displayName}
              />
              <Dropdown
                label={'상태'}
                options={UNIT_STATUS_OPTIONS}
                value={form.status}
                onChange={(value) => setForm((previous) => ({
                  ...previous,
                  status: value as UnitStatus
                }))}
                error={errors.status}
                required
              />
              {message && (
                <p
                  className={styles.error}
                  role={'alert'}
                >
                  {message}
                </p>
              )}
            </>
          )}
          {target.clientId && (
            <Button
              variant={'outline'}
              onClick={deleteEntry}
              className={styles['delete-button']}
              data-kind={target.kind}
            >
              {isBuilding ? '동 삭제' : '세대 삭제'}
            </Button>
          )}
        </div>
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
          >
            {target.clientId ? '수정' : '추가'}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
