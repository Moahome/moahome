'use client';

import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  useRef,
  useState,
  type FormEvent
} from 'react';
import { UNIT_STATUS_OPTIONS } from '../../constants/propertyOptions';
import {
  getBuildingNameError,
  getUnitFormErrors,
  normalizeBuildingName,
  normalizeUnitForm
} from '../../model/unitForm';
import type {
  BuildingDraft,
  UnitDraft,
  UnitForm,
  UnitFormErrors,
  UnitStatus
} from '../../model/unitFormTypes';
import { getSortedBuildings } from '../../model/unitSorting';
import styles from './buildingUnitFormModal.module.css';

export interface BuildingUnitFormTarget {
  kind: 'building' | 'unit';
  clientId: string | null;
  buildingClientId?: string;
}

/** 초기 등록과 세대 관리의 모달·페이지에서 입력·검증을 공유하고 저장과 페이지 이동은 호출자에게 위임합니다. */
export function BuildingUnitFormModal({
  target,
  hasBuildings,
  buildings,
  units,
  onSaveBuilding,
  onSaveUnit,
  onDelete,
  onClose,
  busy = false,
  errorMessage = '',
  presentation = 'modal',
}: {
  target: BuildingUnitFormTarget;
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  onSaveBuilding?: (building: BuildingDraft) => void;
  onSaveUnit: (unit: UnitDraft) => void;
  onDelete?: () => string | null;
  onClose: () => void;
  busy?: boolean;
  errorMessage?: string;
  presentation?: 'modal' | 'page';
}) {
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

  /** 오류는 필드에 연결하고 정리한 값만 전달하며 수정 시 호출자가 전달한 기존 ID를 유지합니다. */
  function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage('');

    if (isBuilding) {
      if (!onSaveBuilding) return;
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

  /** 삭제 기능을 전달받은 초기 설정에서만 호출하고 삭제 확인과 실제 반영은 호출자에게 위임합니다. */
  function deleteEntry() {
    const failure = onDelete?.();

    if (failure) setMessage(failure);
  }

  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <Title
          id={'building-unit-form-modal-title'}
        >
          {title}
        </Title>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={`${title} 닫기`}
            onClick={onClose}
            disabled={busy}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      <form
        onSubmit={submitEntry}
        noValidate
      >
        <fieldset
          className={styles.fields}
          disabled={busy}
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
                label={'세대 별칭'}
                placeholder={'예) 별채 (선택사항)'}
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
              {(message || errorMessage) && (
                <p
                  className={styles.error}
                  role={'alert'}
                >
                  {message || errorMessage}
                </p>
              )}
            </>
          )}
          {target.clientId && onDelete && (
            <Button
              variant={'outline'}
              onClick={deleteEntry}
              className={styles['delete-button']}
              data-kind={target.kind}
            >
              {isBuilding ? '동 삭제' : '세대 삭제'}
            </Button>
          )}
        </fieldset>
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            onClick={onClose}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            variant={target.clientId ? 'outline' : 'primary'}
            tone={target.clientId ? 'success' : undefined}
            loading={busy}
          >
            {target.clientId ? '수정' : '추가'}
          </Button>
        </footer>
      </form>
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'building-unit-form-modal-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      initialFocusRef={entryRef}
      onClose={onClose}
      busy={busy}
      className={styles.dialog}
      aria-labelledby={'building-unit-form-modal-title'}
    >
      {content}
    </ClientModal>
  );
}
