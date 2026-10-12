'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Input } from '@/shared/ui/form-controls';
import {
  getBuildingNameError,
  normalizeBuildingName,
  type BuildingDraft,
  type UnitDraft
} from '../../model/unitForm';
import { getSortedBuildings } from '../../model/unitSorting';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { UnitDeleteConfirmation } from '../unit-delete-confirmation/unitDeleteConfirmation';
import styles from './buildingManager.module.css';

/** 등록 초안과 저장된 동에서 같은 목록·입력을 사용하며 삭제는 호출자가 지원하는 경우에만 제공합니다. */
export function BuildingManager({
  buildings,
  units,
  onSave,
  onDelete,
  onClose,
  busy = false,
  errorMessage = '',
  presentation = 'modal',
  minimumBuildingCount = 0,
  deletionDescription = '동과 해당 동에 입력한 모든 세대가 함께 삭제됩니다.',
}: {
  buildings: BuildingDraft[];
  units: UnitDraft[];
  onSave: (building: BuildingDraft) => void | boolean | Promise<void | boolean>;
  onDelete?: (clientId: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  busy?: boolean;
  errorMessage?: string;
  presentation?: 'modal' | 'page';
  minimumBuildingCount?: number;
  deletionDescription?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // undefined는 목록, null은 새 동, 문자열은 기존 동 수정 상태입니다.
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [pendingBuildingId, setPendingBuildingId] = useState<string | null>(null);
  const pendingBuilding = buildings.find((building) => building.clientId === pendingBuildingId);
  const pendingUnitCount = units.filter((unit) => unit.buildingClientId === pendingBuildingId).length;
  const sortedBuildings = getSortedBuildings(buildings);
  // 저장된 관리대상은 마지막 동을 유지하고 등록 초안은 호출자가 정한 삭제 범위를 사용합니다.
  const canDelete = Boolean(onDelete) && buildings.length > minimumBuildingCount;

  useEffect(() => {
    if (editingId !== undefined) {
      inputRef.current?.focus();
      return;
    }

    addButtonRef.current?.focus();
  }, [editingId]);

  /** 동일 ID로 동 이름을 검증하고 저장 성공 후 목록으로 돌아갑니다. 저장 실패에는 입력을 유지합니다. */
  async function saveBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextName = normalizeBuildingName(name);
    const failure = getBuildingNameError(nextName, buildings, editingId ?? undefined);

    if (failure) return setMessage(failure);

    const saved = await onSave({
      clientId: editingId ?? crypto.randomUUID(),
      name: nextName
    });
    if (saved === false) return;
    setMessage('');
    setEditingId(undefined);
  }

  /** 확인한 동과 연결 세대를 함께 제거하며 취소 전에는 초안을 변경하지 않습니다. */
  async function confirmBuildingDeletion() {
    if (!pendingBuilding || !onDelete || !canDelete || busy) return;

    const deleted = await onDelete(pendingBuilding.clientId);
    if (deleted === false) return;
    setPendingBuildingId(null);
    setMessage('');
  }

  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <Title
          id={'building-manager-title'}
        >
          동 관리
        </Title>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'동 관리 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      {editingId !== undefined ? (
        <form
          onSubmit={(event) => void saveBuilding(event)}
          noValidate
        >
          <fieldset
            disabled={busy}
            className={styles.fields}
          >
            <Input
              ref={inputRef}
              label={editingId === null ? '새 동 이름' : '동 이름'}
              placeholder={'예) 101동, A동'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={message || errorMessage || undefined}
              required
            />
            <div
              className={styles['form-actions']}
            >
              <Button
                variant={'outline'}
                onClick={() => {
                  setEditingId(undefined);
                  setMessage('');
                }}
              >
                취소
              </Button>
              <Button
                type={'submit'}
                variant={editingId === null ? 'primary' : 'outline'}
                tone={editingId === null ? undefined : 'success'}
              >
                {editingId === null ? '추가' : '수정'}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p
            className={styles.description}
          >
            관리할 동을 추가하거나 이름을 수정할 수 있어요.
          </p>
          {buildings.length > 0 ? (
            <ul
              className={styles.list}
            >
              {sortedBuildings.map((building) => {
                const unitCount = units.filter((unit) => unit.buildingClientId === building.clientId).length;

                return (
                  <li
                    key={building.clientId}
                  >
                    <div
                      className={styles['row-header']}
                    >
                      <div
                        className={styles.identity}
                      >
                        <strong>
                          {building.name}
                        </strong>
                        <span>
                          {unitCount}
                          세대
                        </span>
                      </div>
                      <Button
                        variant={'ghost'}
                        tone={'success'}
                        size={'sm'}
                        iconOnly
                        aria-label={`${building.name} 수정`}
                        disabled={busy}
                        onClick={() => {
                          setEditingId(building.clientId);
                          setName(building.name);
                          setMessage('');
                        }}
                        leadingIcon={(
                          <ServiceIcon
                            name={'pen'}
                          />
                        )}
                      />
                      {canDelete && (
                        <Button
                          variant={'ghost'}
                          size={'sm'}
                          iconOnly
                          className={styles['delete-button']}
                          aria-label={`${building.name} 삭제`}
                          disabled={busy}
                          onClick={() => {
                            setPendingBuildingId(building.clientId);
                            setMessage('');
                          }}
                          leadingIcon={(
                            <ServiceIcon
                              name={'trash'}
                            />
                          )}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              className={styles.empty}
            >
              아직 등록한 동이 없어요.
            </p>
          )}
          {message && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {message}
            </p>
          )}
          <Button
            ref={addButtonRef}
            disabled={busy}
            variant={'outline'}
            className={styles.add}
            onClick={() => {
              setEditingId(null);
              setName('');
              setMessage('');
            }}
            leadingIcon={(
              <ServiceIcon
                name={'plus'}
              />
            )}
          >
            동 추가
          </Button>
        </>
      )}
      {pendingBuilding && (
        <UnitDeleteConfirmation
          title={'동 삭제 확인'}
          label={`${pendingBuilding.name}과 연결된 ${pendingUnitCount}세대`}
          description={deletionDescription}
          busy={busy}
          errorMessage={errorMessage}
          onConfirm={() => void confirmBuildingDeletion()}
          onClose={() => setPendingBuildingId(null)}
        />
      )}
      {editingId === undefined && (
        <footer
          className={styles.footer}
        >
          <Button
            disabled={busy}
            onClick={onClose}
          >
            완료
          </Button>
        </footer>
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'building-manager-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      initialFocusRef={addButtonRef}
      onClose={onClose}
      busy={busy}
      className={styles.dialog}
      aria-labelledby={'building-manager-title'}
    >
      {content}
    </ClientModal>
  );
}
