'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getSortedBuildings,
  getSortedUnits
} from '@/entities/property';
import { RESIDENT_RELATION_OPTIONS } from '@/entities/resident';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import {
  getRegistrationOptions,
  registerResident
} from '../../api/residentRegistrationApi';
import {
  getResidentRegistrationError,
  normalizeResidentPhone
} from '../../model/residentRegistration';
import styles from './residentRegistrationForm.module.css';

/** 웹 모달과 모바일 페이지가 같은 입력·세대 선택·저장 검증을 사용하며 초안을 저장소에 남기지 않습니다. */
export function ResidentRegistrationForm({
  propertyId,
  onRegistered,
  onCancel,
  onBusyChange
}: {
  propertyId: string;
  onRegistered: () => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [relationType, setRelationType] = useState('');
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
    normalizedPhone = normalizeResidentPhone(phone);
  } catch {
    phoneError = '올바른 연락처를 입력해주세요.';
  }
  const nameError = !name.trim() || [...name.trim()].length > 50 ? '이름을 1~50자로 입력해주세요.' : '';
  const unitError = !selectable.some((unit) => unit.clientId === unitId) ? '소속 세대를 선택해주세요.' : '';
  const relationError = !RESIDENT_RELATION_OPTIONS.some((item) => item.value === relationType) ? '관계를 선택해주세요.' : '';

  /** 중복 클릭을 즉시 차단하며 실패에는 입력과 요청 ID를 유지하여 같은 저장을 안전하게 재시도합니다. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (pendingRef.current || !options.isSuccess || nameError || phoneError || unitError || relationError) return;
    pendingRef.current = true;
    setBusy(true);
    setMessage('');
    onBusyChange?.(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await registerResident(propertyId, {
        requestId: requestId.current,
        name: name.trim(),
        phone: normalizedPhone,
        unitId,
        relationType
      });
      if (activeRef.current) onRegistered();
    } catch (error) {
      if (activeRef.current) setMessage(getResidentRegistrationError(error));
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
    <div
      className={styles.state}
      role={'alert'}
    >
      <p>
        세대 목록을 불러오지 못했어요.
      </p>
      <Button
        variant={'outline'}
        onClick={() => void options.refetch()}
      >
        다시 시도
      </Button>
      <Button
        variant={'ghost'}
        onClick={onCancel}
      >
        취소
      </Button>
    </div>
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
        <Input
          label={'연락처 (선택)'}
          name={'residentPhone'}
          type={'tel'}
          autoComplete={'off'}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={attempted ? phoneError : undefined}
          placeholder={'010-1234-5678'}
          description={'목록에는 끝 4자리만 표시됩니다.'}
        />
        {data?.hasBuildings && (
          <Dropdown
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
            placeholder={'동을 선택해주세요'}
            error={attempted && !buildingId ? '동을 선택해주세요.' : undefined}
          />
        )}
        <Dropdown
          label={'소속 세대'}
          required
          value={unitId}
          options={selectable.map((unit) => ({
            value: unit.clientId,
            label: /호$/.test(unit.unitNumber) ? unit.unitNumber : `${unit.unitNumber}호`
          }))}
          disabled={Boolean(data?.hasBuildings && !buildingId)}
          onChange={setUnitId}
          placeholder={'호수를 선택해주세요'}
          error={attempted ? unitError : undefined}
        />
        <Dropdown
          label={'세대와의 관계'}
          required
          value={relationType}
          options={RESIDENT_RELATION_OPTIONS}
          onChange={setRelationType}
          placeholder={'관계를 선택해주세요'}
          error={attempted ? relationError : undefined}
        />
      </fieldset>
      <p
        className={styles.notice}
      >
        해당 세대에 처음 등록되는 주민은 대표로 지정됩니다. 주민 등록 후 서비스 가입은 별도로 진행합니다.
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
          loading={busy}
        >
          {busy ? '등록 중…' : '등록'}
        </Button>
      </div>
    </form>
  );
}
