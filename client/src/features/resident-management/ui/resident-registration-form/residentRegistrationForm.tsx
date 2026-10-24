'use client';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  getSortedBuildings,
  getSortedUnits
} from '@/entities/property';
import { RESIDENT_RELATION_OPTIONS } from '@/entities/resident';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  SelectDropdown,
  Input
} from '@/shared/ui/form-controls';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { updateResident } from '../../api/residentManagementApi';
import type { ResidentDetail } from '../../api/residentManagementApiTypes';
import {
  getRegistrationOptions,
  registerResident
} from '../../api/residentRegistrationApi';
import { getResidentManagementError } from '../../model/residentManagement';
import {
  getResidentRegistrationError,
  normalizeResidentPhone
} from '../../model/residentRegistration';
import styles from './residentRegistrationForm.module.css';

/** 웹 모달과 모바일 페이지가 같은 입력·세대 선택·저장 검증을 사용하며 초안을 저장소에 남기지 않습니다. */
export function ResidentRegistrationForm({
  propertyId,
  onSaved,
  onCancel,
  onBusyChange,
  resident
}: {
  propertyId: string;
  onSaved: (resident?: ResidentDetail) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  resident?: ResidentDetail;
}) {
  const session = useSession();
  const options = useQuery({
    queryKey: ['resident-registration-units', session.data?.id, propertyId],
    queryFn: () => getRegistrationOptions(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
  const [name, setName] = useState(resident?.name ?? '');
  const [phone, setPhone] = useState('');
  const [buildingId, setBuildingId] = useState(resident?.buildingId ?? '');
  const [unitId, setUnitId] = useState(resident?.unitId ?? '');
  const [relationType, setRelationType] = useState(resident?.relationType ?? 'OTHER');
  const [serviceRole, setServiceRole] = useState(resident?.serviceRole ?? '');
  const canEditRole = resident?.signupStatus === 'APPROVED' && (resident.serviceRole === 'MANAGER' || resident.serviceRole === 'RESIDENT');
  const [phoneAction, setPhoneAction] = useState<'KEEP' | 'REPLACE' | 'REMOVE'>('KEEP');
  const [replacementResidentId, setReplacementResidentId] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pendingRef = useRef(false);
  const activeRef = useRef(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const data = options.data;
  const buildings = getSortedBuildings(data?.buildings ?? []);
  const units = getSortedUnits((data?.units ?? []).filter((unit) => unit.status !== 'INACTIVE').map((unit) => ({
    clientId: unit.id,
    buildingClientId: unit.buildingId,
    unitNumber: unit.unitNumber,
    displayName: null,
    floor: null,
    status: unit.status as 'ACTIVE' | 'VACANT'
  })), buildings.map((item) => ({
    clientId: item.id,
    name: item.name
  })), data?.hasBuildings ?? false);
  const selectable = units.filter((unit) => !data?.hasBuildings || unit.buildingClientId === buildingId);
  let normalizedPhone: string | null = null;
  let phoneError = '';
  try {
    normalizedPhone = normalizeResidentPhone(resident && phoneAction !== 'REPLACE' ? '' : phone);
    if (resident && phoneAction === 'REPLACE' && !normalizedPhone) phoneError = '새 연락처를 입력해주세요.';
  } catch {
    phoneError = '올바른 연락처를 입력해주세요.';
  }
  const nameError = !name.trim() || [...name.trim()].length > 50 ? '이름을 1~50자로 입력해주세요.' : '';
  const unitError = !selectable.some((unit) => unit.clientId === unitId) ? '호수를 선택해주세요.' : '';
  const relationError = !RESIDENT_RELATION_OPTIONS.some((item) => item.value === relationType) ? '주민 구분을 선택해주세요.' : '';
  const needsRepresentative = Boolean(resident && resident.unitId !== unitId && resident.representativeCandidates.length);
  const representativeError = needsRepresentative && !replacementResidentId ? '남은 주민 중 새 대표를 선택해주세요.' : '';
  const submitLabel = resident ? '수정' : '등록';
  const pendingLabel = resident ? '수정 중…' : '등록 중…';

  /** 중복 클릭을 즉시 차단하며 실패에는 입력과 요청 ID를 유지하여 같은 저장을 안전하게 재시도합니다. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (pendingRef.current || !options.isSuccess || nameError || phoneError || unitError || relationError || representativeError) return;
    pendingRef.current = true;
    setBusy(true);
    setMessage('');
    onBusyChange?.(true);
    requestId.current ??= crypto.randomUUID();
    try {
      if (resident) {
        const saved = await updateResident(propertyId, resident.id, {
          name: name.trim(),
          unitId,
          relationType,
          phoneAction,
          phone: phoneAction === 'REPLACE' ? normalizedPhone : null,
          replacementResidentId: needsRepresentative ? replacementResidentId : null,
          expectedUpdatedAt: resident.updatedAt,
          ...(canEditRole && serviceRole !== resident.serviceRole ? {
            serviceRole: serviceRole as 'MANAGER' | 'RESIDENT',
            expectedServiceRole: resident.serviceRole as 'MANAGER' | 'RESIDENT'
          } : {})
        });
        if (activeRef.current) onSaved(saved);
        return;
      }
      await registerResident(propertyId, {
        requestId: requestId.current,
        name: name.trim(),
        phone: normalizedPhone,
        unitId,
        relationType
      });
      if (activeRef.current) onSaved();
    } catch (error) {
      if (activeRef.current) setMessage(resident ? getResidentManagementError(error) : getResidentRegistrationError(error));
    } finally {
      pendingRef.current = false;
      if (activeRef.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  if (options.isPending) return (
    <p
      role={'status'}
    >
      등록할 세대를 불러오고 있어요.
    </p>
  );
  if (options.isError) return (
    <RequestError
      error={options.error}
      onRetry={() => void options.refetch({
        cancelRefetch: false
      })}
    />
  );
  if (!units.length) return (
    <div
      className={styles.state}
    >
      <p>
        주민을 등록하려면 먼저 세대를 등록해주세요.
      </p>
      <Button
        variant={'outline'}
        onClick={onCancel}
      >
        돌아가기
      </Button>
    </div>
  );

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      noValidate
      aria-busy={busy}
    >
      <fieldset
        className={styles.fields}
        disabled={busy}
      >
        <Input
          label={'주민 이름'}
          name={'residentName'}
          autoComplete={'off'}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={attempted ? nameError : undefined}
          placeholder={'이름을 입력해주세요'}
        />
        {resident && (
          <Dropdown
            label={'연락처 변경'}
            value={phoneAction}
            clearable={false}
            options={[
              {
                value: 'KEEP',
                label: `기존 연락처 유지${resident.phoneLast4 ? ` (•••• ${resident.phoneLast4})` : ' (없음)'}`
              },
              {
                value: 'REPLACE',
                label: '새 연락처로 변경'
              },
              ...(!resident.hasLinkedRequests ? [{
                value: 'REMOVE',
                label: '연락처 삭제'
              }] : [])
            ]}
            onChange={(value) => { setPhoneAction(value as 'KEEP' | 'REPLACE' | 'REMOVE'); setPhone(''); }}
          />
        )}
        {(!resident || phoneAction === 'REPLACE') && (
          <Input
            label={resident ? '새 연락처' : '연락처 (선택)'}
            required={Boolean(resident)}
            name={'residentPhone'}
            type={'tel'}
            autoComplete={'off'}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={attempted ? phoneError : undefined}
            placeholder={'010-1234-5678'}
            description={'목록에는 끝 4자리만 표시됩니다.'}
          />
        )}
        {data?.hasBuildings && (
          <SelectDropdown
            label={'동'}
            required
            value={buildingId}
            options={buildings.map((item) => ({
              value: item.id,
              label: item.name
            }))}
            onChange={(value) => {
              setBuildingId(value);
              setUnitId('');
            }}
            placeholder={'동 선택 또는 검색'}
            error={attempted && !buildingId ? '동을 선택해주세요.' : undefined}
          />
        )}
        <SelectDropdown
          label={'호수'}
          required
          value={unitId}
          options={selectable.map((unit) => ({
            value: unit.clientId,
            label: /호$/.test(unit.unitNumber) ? unit.unitNumber : `${unit.unitNumber}호`
          }))}
          disabled={Boolean(data?.hasBuildings && !buildingId)}
          onChange={setUnitId}
          placeholder={'호수 선택 또는 검색'}
          error={attempted ? unitError : undefined}
        />
        <Dropdown
          label={'주민 구분'}
          clearable={false}
          value={relationType}
          options={RESIDENT_RELATION_OPTIONS}
          onChange={setRelationType}
          placeholder={'주민 구분을 선택해주세요'}
          error={attempted ? relationError : undefined}
        />
        {needsRepresentative && (
          <Dropdown
            label={'기존 동·호수의 새 대표'}
            required
            value={replacementResidentId}
            options={resident!.representativeCandidates.map((item) => ({
              value: item.id,
              label: item.name
            }))}
            onChange={setReplacementResidentId}
            placeholder={'남은 주민 중 선택해주세요'}
            error={attempted ? representativeError : undefined}
          />
        )}
        {resident && (
          <Dropdown
            label={'역할'}
            value={serviceRole}
            disabled={!canEditRole}
            options={resident.serviceRole === 'ADMIN' ? [{
              value: 'ADMIN',
              label: '관리소장'
            }] : [
              {
                value: 'RESIDENT',
                label: '주민'
              },
              {
                value: 'MANAGER',
                label: '부담당자'
              }
            ]}
            placeholder={'가입 승인 후 변경 가능'}
            onChange={setServiceRole}
          />
        )}
      </fieldset>
      <p
        className={styles.notice}
      >
        {resident ? '연락처 변경은 연결된 가입 신청에도 반영합니다. 동·호수를 옮기는 대표 주민은 기존 세대의 새 대표를 직접 선택해주세요.' : '해당 세대에 처음 등록되는 주민은 대표로 지정됩니다. 주민 등록 후 서비스 가입은 별도로 진행합니다.'}
      </p>
      {message && (
        <p
          className={styles.error}
          role={'alert'}
        >
          {message}
        </p>
      )}
      <div
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          onClick={onCancel}
          disabled={busy}
        >
          취소
        </Button>
        <Button
          type={'submit'}
          variant={resident ? 'outline' : 'primary'}
          tone={resident ? 'success' : undefined}
          loading={busy}
        >
          {busy ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
