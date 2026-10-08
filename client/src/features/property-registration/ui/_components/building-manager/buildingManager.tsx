'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import {
  getBuildingNameError,
  normalizeBuildingName,
  type BuildingDraft,
  type UnitDraft
} from '../../../model/unitSetup';
import { getSortedBuildings } from '../../_utils/setupSorting';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import { UnitDeleteConfirmation } from '../unit-delete-confirmation/unitDeleteConfirmation';
import styles from './buildingManager.module.css';

/** 본문에서는 동 선택만 표시하고 동 초안의 추가·수정·삭제를 이 창에 모읍니다. */
export function BuildingManager({
  buildings,
  units,
  onSave,
  onDelete,
  onClose,
}: {
  buildings: BuildingDraft[];
  units: UnitDraft[];
  onSave: (building: BuildingDraft) => void;
  onDelete: (clientId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({
          preventScroll: true
        });
      }
    };
  }, []);

  useEffect(() => {
    if (editingId !== undefined) {
      inputRef.current?.focus();
      return;
    }

    addButtonRef.current?.focus();
  }, [editingId]);

  /** 기존 검증과 초안 ID를 사용해 이름만 바꿔도 세대 연결과 표시 순서를 유지합니다. */
  function saveBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = normalizeBuildingName(name);
    const failure = getBuildingNameError(nextName, buildings, editingId ?? undefined);

    if (failure) return setMessage(failure);

    onSave({
      clientId: editingId ?? crypto.randomUUID(),
      name: nextName
    });
    setMessage('');
    setEditingId(undefined);
  }

  /** 확인한 동과 연결 세대를 함께 제거하며 취소 전에는 초안을 변경하지 않습니다. */
  function confirmBuildingDeletion() {
    if (!pendingBuilding) return;

    onDelete(pendingBuilding.clientId);
    setPendingBuildingId(null);
    setMessage('');
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'building-manager-title'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'building-manager-title'}
        >
          동 관리
        </h2>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'동 관리 닫기'}
          onClick={onClose}
          leadingIcon={(
            <RegistrationIcon
              name={'close'}
            />
          )}
        />
      </header>
      {editingId !== undefined ? (
        <form
          onSubmit={saveBuilding}
          noValidate
        >
          <Input
            ref={inputRef}
            label={editingId === null ? '새 동 이름' : '동 이름'}
            placeholder={'예) 101동, A동'}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={message || undefined}
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
            >
              {editingId === null ? '추가' : '수정'}
            </Button>
          </div>
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
                        size={'sm'}
                        iconOnly
                        className={styles['edit-button']}
                        aria-label={`${building.name} 수정`}
                        onClick={() => {
                          setEditingId(building.clientId);
                          setName(building.name);
                          setMessage('');
                        }}
                        leadingIcon={(
                          <RegistrationIcon
                            name={'pen'}
                          />
                        )}
                      />
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        iconOnly
                        className={styles['delete-button']}
                        aria-label={`${building.name} 삭제`}
                        onClick={() => {
                          setPendingBuildingId(building.clientId);
                          setMessage('');
                        }}
                        leadingIcon={(
                          <RegistrationIcon
                            name={'trash'}
                          />
                        )}
                      />
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
            variant={'outline'}
            className={styles.add}
            onClick={() => {
              setEditingId(null);
              setName('');
              setMessage('');
            }}
            leadingIcon={(
              <RegistrationIcon
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
          description={'동과 해당 동에 입력한 모든 세대가 함께 삭제됩니다.'}
          onConfirm={confirmBuildingDeletion}
          onClose={() => setPendingBuildingId(null)}
        />
      )}
      {editingId === undefined && (
        <footer
          className={styles.footer}
        >
          <Button
            onClick={onClose}
          >
            완료
          </Button>
        </footer>
      )}
    </dialog>
  );
}
