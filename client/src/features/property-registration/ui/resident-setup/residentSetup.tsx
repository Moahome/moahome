'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  getSortedBuildings,
  getSortedUnits
} from '@/entities/property';
import {
  PhoneConsent,
  RESIDENT_RELATION_OPTIONS,
  ResidentImportGuide,
  formatResidentPhone,
  normalizeResidentPhone
} from '@/entities/resident';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { IconButton } from '@/shared/ui/icon-button';
import { Pagination } from '@/shared/ui/pagination';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import {
  Dropdown,
  Input,
  Radio,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { previewRegistrationResidents } from '../../api/registrationResidentApi';
import type { AdministratorDraft } from '../../model/administratorTypes';
import {
  getResidentDraftError,
  getResidentSetupError,
  isAdministratorResident
} from '../../model/residentSetup';
import type {
  RegistrationResident,
  RegistrationResidentImportRow
} from '../../model/residentSetupTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../model/unitSetupTypes';
import { getUnitLabel } from '../../model/unitSetup';
import { SetupProgress } from '../_components/setup-progress/setupProgress';
import styles from './residentSetup.module.css';

/** 직접 입력과 업로드가 같은 주민 초안을 편집하며 최종 설정 제출 전에는 명부를 저장하지 않습니다. */
export function ResidentSetup({ propertyName, hasBuildings, buildings, units, administrator, residents, onChange, onPrevious, onNext }: {
  propertyName: string;
  hasBuildings: boolean;
  buildings: BuildingDraft[];
  units: UnitDraft[];
  administrator: AdministratorDraft;
  residents: RegistrationResident[];
  onChange: (residents: RegistrationResident[]) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [mode, setMode] = useState<'MANUAL' | 'EXCEL'>('MANUAL');
  const [buildingId, setBuildingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<RegistrationResident>({
    clientId: '',
    unitClientId: '',
    name: '',
    phone: '',
    phoneConsent: false,
    relationType: 'OTHER'
  });
  const [message, setMessage] = useState('');
  const [importRows, setImportRows] = useState<RegistrationResidentImportRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [page, setPage] = useState(1);
  const [importPage, setImportPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const uploadLock = useRef(false);
  const active = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const sortedBuildings = getSortedBuildings(buildings);
  const sortedUnits = getSortedUnits(units, buildings, hasBuildings);
  const included = residents.filter((resident) => !isAdministratorResident(resident, administrator));
  const managerUnit = units.find((unit) => administrator.residenceType === 'RESIDENT' && unit.clientId === administrator.unitClientId);
  const roster = included.map((resident) => ({
    ...resident,
    administrator: false
  }));
  if (managerUnit) roster.unshift({
    clientId: 'administrator',
    unitClientId: managerUnit.clientId,
    name: administrator.name,
    phone: administrator.phone,
    phoneConsent: administrator.phoneConsent === true,
    relationType: 'OTHER',
    administrator: true
  });
  const pageCount = Math.max(1, Math.ceil(roster.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleResidents = roster.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const importPageCount = Math.max(1, Math.ceil(importRows.length / pageSize));
  const currentImportPage = Math.min(importPage, importPageCount);
  const visibleImportRows = importRows.slice((currentImportPage - 1) * pageSize, currentImportPage * pageSize);
  const error = getResidentSetupError(residents, units, administrator);
  const total = included.length + Number(Boolean(managerUnit));

  useEffect(() => {
    active.current = true;
    heading.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
    return () => { active.current = false; };
  }, []);

  function unitLabel(unitClientId: string) {
    const unit = units.find((entry) => entry.clientId === unitClientId);
    if (!unit) return '세대 확인 필요';
    return [buildings.find((building) => building.clientId === unit.buildingClientId)?.name, getUnitLabel(unit)].filter(Boolean).join(' ');
  }

  /** 관리소장 행과 일반 중복을 별도로 검사하고 편집 시 같은 주민의 원래 목록 순서를 보존합니다. */
  function saveResident(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = getResidentDraftError(form, units, administrator);
    if (error) { setMessage(error); return; }
    const resident = {
      ...form,
      clientId: editing ?? crypto.randomUUID(),
      name: form.name.trim(),
      phone: normalizeResidentPhone(form.phone) ?? ''
    };
    const next = editing ? included.map((entry) => entry.clientId === editing ? resident : entry) : [...included, resident];
    const listError = getResidentSetupError(next, units, administrator);
    if (listError) { setMessage(listError); return; }
    onChange(next);
    if (!editing) setPage(Math.max(1, Math.ceil(next.length / pageSize)));
    setEditing(null);
    setEditorOpen(false);
    setForm({
      clientId: '',
      unitClientId: form.unitClientId,
      name: '',
      phone: '',
      phoneConsent: false,
      relationType: 'OTHER'
    });
    setMessage('');
  }

  /** 새 파일의 검증 결과만 교체하며 이미 추가한 주민 초안과 직접 입력은 유지합니다. */
  async function upload(file: File) {
    if (uploadLock.current) return;
    if (!file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > 5 * 1024 * 1024) { setMessage('5MB 이하의 .xlsx 파일을 선택해주세요.'); return; }
    uploadLock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const rows = await previewRegistrationResidents(file, hasBuildings, buildings, units, administrator);
      if (!active.current) return;
      setImportRows(rows);
      setImportPage(1);
      setSelected(rows.filter((row) => row.status === 'READY').map((row) => row.rowNumber));
      setFileName(file.name);
    } catch { if (active.current) setMessage('파일을 검증하지 못했어요. 양식과 서버 연결을 확인해주세요.'); }
    finally { uploadLock.current = false; if (active.current) setBusy(false); }
  }

  /** 검증 뒤 바뀐 세대·담당자도 다시 확인하고 선택한 정상 행만 현재 초안 끝에 추가합니다. */
  function addImported() {
    const next = [...included];
    let skipped = 0;
    for (const row of importRows.filter((row) => row.status === 'READY' && selected.includes(row.rowNumber))) {
      const unit = units.find((entry) => entry.buildingClientId === row.buildingClientId && entry.unitNumber === row.unitNumber);
      const resident: RegistrationResident = {
        clientId: crypto.randomUUID(),
        unitClientId: unit?.clientId ?? '',
        name: row.name,
        phone: row.phoneConsent ? row.phone ?? '' : '',
        phoneConsent: row.phoneConsent,
        relationType: row.relationType
      };
      if (getResidentDraftError(resident, units, administrator) || getResidentSetupError([...next, resident], units, administrator)) { skipped++; continue; }
      next.push(resident);
    }
    onChange(next);
    setImportRows([]);
    setSelected([]);
    setMessage(skipped ? `중복되거나 정보가 변경된 ${skipped}명은 제외했습니다.` : '');
  }

  return (
    <main
      className={styles.page}
    >
      <header
        className={styles.heading}
      >
        <h1>
          {propertyName}
          {' '}
          초기 설정
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={3}
      />
      <section
        className={styles.card}
        aria-labelledby={'resident-setup-title'}
      >
        <div
          className={styles.intro}
        >
          <span
            className={styles['intro-icon']}
          >
            <ServiceIcon
              name={'users'}
            />
          </span>
          <div>
            <span
              className={styles.eyebrow}
            >
              주민 정보
            </span>
            <h2
              ref={heading}
              tabIndex={-1}
              id={'resident-setup-title'}
            >
              함께 사는 주민을 등록해주세요
            </h2>
            <p>
              직접 입력하거나 엑셀로 여러 명을 한 번에 추가할 수 있어요.
            </p>
          </div>
        </div>
        <fieldset
          className={styles.methods}
        >
          <legend
            className={styles['sr-only']}
          >
            주민 등록 방식
          </legend>
          <Radio
            name={'resident-input-method'}
            label={'직접 입력'}
            description={'주민 정보를 한 명씩 입력해요.'}
            variant={'card'}
            checked={mode === 'MANUAL'}
            onChange={() => setMode('MANUAL')}
          />
          <Radio
            name={'resident-input-method'}
            label={'엑셀 업로드'}
            description={'양식을 내려받아 한 번에 추가해요.'}
            variant={'card'}
            checked={mode === 'EXCEL'}
            onChange={() => setMode('EXCEL')}
          />
        </fieldset>
        {editorOpen && (
          <ClientModal
            className={styles.dialog}
            onClose={() => { setEditorOpen(false); setMessage(''); }}
            aria-labelledby={'resident-editor-title'}
            initialFocusRef={editorHeading}
          >
            <header
              className={styles['dialog-header']}
            >
              <div>
                <h2
                  id={'resident-editor-title'}
                  ref={editorHeading}
                  tabIndex={-1}
                >
                  {editing ? '주민 수정' : '주민 추가'}
                </h2>
                <p
                  className={styles['dialog-description']}
                >
                  소속 세대와 주민 정보를 입력해주세요.
                </p>
              </div>
              <Button
                variant={'ghost'}
                iconOnly
                aria-label={'주민 입력 닫기'}
                onClick={() => { setEditorOpen(false); setMessage(''); }}
                leadingIcon={(
                  <ServiceIcon
                    name={'close'}
                  />
                )}
              />
            </header>
            <form
              className={styles.editor}
              onSubmit={saveResident}
              noValidate
            >
              <div
                className={styles['section-heading']}
              >
                <h3>
                  주민 정보
                </h3>
                <span>
                  <b>
                    *
                  </b>
                  {' '}
                  필수 입력
                </span>
              </div>
              <div
                className={styles.fields}
              >
                {hasBuildings && (
                  <SelectDropdown
                    label={'동'}
                    required
                    value={buildingId}
                    placeholder={'동 선택'}
                    options={sortedBuildings.map((building) => ({
                      value: building.clientId,
                      label: building.name
                    }))}
                    onChange={(value) => { setBuildingId(value); setForm({
                      ...form,
                      unitClientId: ''
                    }); }}
                  />
                )}
                <SelectDropdown
                  label={'호수'}
                  required
                  value={form.unitClientId}
                  placeholder={hasBuildings && !buildingId ? '동을 먼저 선택해주세요' : '호수 선택'}
                  disabled={hasBuildings && !buildingId}
                  options={sortedUnits.filter((unit) => !hasBuildings || unit.buildingClientId === buildingId).map((unit) => ({
                    value: unit.clientId,
                    label: getUnitLabel(unit)
                  }))}
                  onChange={(unitClientId) => setForm({
                    ...form,
                    unitClientId
                  })}
                />
                <Input
                  label={'주민 이름'}
                  required
                  maxLength={50}
                  value={form.name}
                  placeholder={'이름을 입력해주세요'}
                  autoComplete={'off'}
                  onChange={(event) => setForm({
                    ...form,
                    name: event.target.value
                  })}
                />
                <Dropdown
                  label={'주민 구분'}
                  value={form.relationType}
                  options={RESIDENT_RELATION_OPTIONS}
                  onChange={(relationType) => setForm({
                    ...form,
                    relationType: relationType as RegistrationResident['relationType']
                  })}
                />
                <Input
                  label={'전화번호 (선택)'}
                  type={'tel'}
                  value={form.phone}
                  maxLength={64}
                  placeholder={'010-1234-5678'}
                  autoComplete={'off'}
                  onChange={(event) => setForm({
                    ...form,
                    phone: event.target.value,
                    phoneConsent: false
                  })}
                />
              </div>
              <div
                className={styles.contact}
              >
                <PhoneConsent
                  checked={form.phoneConsent}
                  onChange={(phoneConsent) => setForm({
                    ...form,
                    phoneConsent
                  })}
                />
              </div>
              {message && (
                <p
                  className={styles.message}
                  role={'alert'}
                >
                  {message}
                </p>
              )}
              <div
                className={styles['add-actions']}
              >
                <Button
                  variant={'outline'}
                  onClick={() => { setEditorOpen(false); setMessage(''); }}
                >
                  취소
                </Button>
                <Button
                  type={'submit'}
                >
                  {editing ? '저장' : '추가'}
                </Button>
              </div>
            </form>
          </ClientModal>
        )}
        {mode === 'EXCEL' && (
          <div
            className={styles.upload}
          >
            <div
              className={styles['upload-heading']}
            >
              <div>
                <h3>
                  엑셀 파일로 주민 추가
                </h3>
                <p>
                  {hasBuildings ? '등록한 동·호수에 맞춰 입력해주세요.' : '등록한 호수에 맞춰 입력해주세요.'}
                  {' '}
                  한 번에 최대 1,000명까지 추가할 수 있어요.
                </p>
              </div>

            </div>
            <FileDropzone
              label={'초기 주민 엑셀 업로드'}
              inputLabel={'주민 엑셀 파일'}
              accept={'.xlsx'}
              description={'.xlsx 파일 · 최대 5MB'}
              busy={busy}
              onFile={(file) => void upload(file)}
            />
            <a
              className={styles['template-link']}
              href={hasBuildings ? '/residentImportTemplate.xlsx' : '/residentImportNoBuildingTemplate.xlsx'}
              download={'주민 업로드 양식.xlsx'}
            >
              <ServiceIcon
                name={'excel'}
              />
              양식 다운로드
            </a>
            <ResidentImportGuide
              hasBuildings={hasBuildings}
              initialSetup
            />
            {importRows.length > 0 && (
              <div
                className={styles['import-result']}
              >
                <h3>
                  {fileName}
                  {' '}
                  · 검증 결과
                </h3>
                <DataTable
                  label={'주민 엑셀 검증'}
                  rows={visibleImportRows}
                  getRowKey={(row) => String(row.rowNumber)}
                  columns={[
                    {
                      key: 'select',
                      header: '선택',
                      render: (row) => (
                        <input
                          type={'checkbox'}
                          aria-label={`${row.name} 선택`}
                          disabled={row.status !== 'READY'}
                          checked={selected.includes(row.rowNumber)}
                          onChange={(event) => setSelected(event.target.checked ? [...selected, row.rowNumber] : selected.filter((number) => number !== row.rowNumber))}
                        />
                      )
                    },
                    {
                      key: 'unit',
                      header: '동·호수',
                      render: (row) => [buildings.find((building) => building.clientId === row.buildingClientId)?.name, row.unitNumber].filter(Boolean).join(' ')
                    },
                    {
                      key: 'name',
                      header: '이름',
                      render: (row) => row.name
                    },
                    {
                      key: 'reason',
                      header: '검증 결과',
                      render: (row) => row.reason || '등록 가능'
                    }
                  ]}
                  emptyState={null}
                />
                <Pagination
                  label={'엑셀 검증 페이지'}
                  unit={'명'}
                  total={importRows.length}
                  page={currentImportPage}
                  pageCount={importPageCount}
                  pageSize={pageSize}
                  onPageChange={setImportPage}
                />
                <Button
                  onClick={addImported}
                  disabled={!selected.length}
                >
                  선택한 주민 추가
                </Button>
              </div>
            )}
          </div>
        )}
        {!editorOpen && message && (
          <p
            className={styles.message}
            role={'alert'}
          >
            {message}
          </p>
        )}
        <section
          className={styles.roster}
          aria-label={'등록할 주민 목록'}
        >
          <div
            className={styles['section-heading']}
          >
            <h3>
              등록할 주민
              <span
                className={styles.count}
              >
                {total}
                명
              </span>
            </h3>
            <div
              className={styles['roster-actions']}
            >
              <Dropdown
                aria-label={'표시 개수'}
                value={String(pageSize)}
                options={[10, 20, 50, 100].map((size) => ({
                  value: String(size),
                  label: `${size}명씩`
                }))}
                onChange={(value) => { setPageSize(Number(value)); setPage(1); setImportPage(1); }}
              />
              {mode === 'MANUAL' && (
                <Button
                  variant={'outline'}
                  leadingIcon={(
                    <ServiceIcon
                      name={'plus'}
                    />
                  )}
                  onClick={() => { setEditing(null); setForm({
                    clientId: '',
                    unitClientId: '',
                    name: '',
                    phone: '',
                    phoneConsent: false,
                    relationType: 'OTHER'
                  }); setBuildingId(''); setMessage(''); setEditorOpen(true); }}
                >
                  주민 추가
                </Button>
              )}
            </div>
          </div>
          <DataTable
            label={'등록할 주민'}
            rows={visibleResidents}
            getRowKey={(resident) => resident.clientId}
            columns={[
              {
                key: 'unit',
                header: hasBuildings ? '동·호수' : '호수',
                render: (resident) => unitLabel(resident.unitClientId)
              },
              {
                key: 'name',
                header: '이름',
                rowHeader: true,
                render: (resident) => (
                  <strong
                    className={styles['resident-name']}
                  >
                    {resident.name}
                    {resident.administrator && (
                      <span
                        className={styles['manager-badge']}
                      >
                        관리소장
                      </span>
                    )}
                  </strong>
                )
              },
              {
                key: 'relation',
                header: '주민 구분',
                render: (resident) => RESIDENT_RELATION_OPTIONS.find((option) => option.value === resident.relationType)?.label
              },
              {
                key: 'phone',
                header: '전화번호',
                render: (resident) => resident.phone ? formatResidentPhone(resident.phone) : (
                  <span
                    className={styles.muted}
                  >
                    미등록
                  </span>
                )
              },
              {
                key: 'actions',
                header: '관리',
                align: 'right',
                render: (resident) => (
                  <div
                    className={styles['row-actions']}
                  >
                    <IconButton
                      size={'sm'}
                      variant={'ghost'}
                      tone={'success'}
                      iconOnly
                      aria-label={`${resident.name} 수정`}
                      icon={(
                        <ServiceIcon
                          name={'pen'}
                        />
                      )}
                      onClick={() => { if (resident.administrator) { onPrevious(); return; } setForm(resident); setEditing(resident.clientId); setBuildingId(units.find((unit) => unit.clientId === resident.unitClientId)?.buildingClientId ?? ''); setMode('MANUAL'); setMessage(''); setEditorOpen(true); }}
                    />
                    {!resident.administrator && (
                      <IconButton
                        size={'sm'}
                        variant={'ghost'}
                        tone={'danger'}
                        iconOnly
                        aria-label={`${resident.name} 삭제`}
                        icon={(
                          <ServiceIcon
                            name={'trash'}
                          />
                        )}
                        onClick={() => { onChange(residents.filter((entry) => entry.clientId !== resident.clientId)); if (editing === resident.clientId) { setEditing(null); setForm({
                          ...form,
                          name: '',
                          phone: '',
                          phoneConsent: false
                        }); } }}
                      />
                    )}
                  </div>
                )
              }
            ]}
            emptyState={(
              <div
                className={styles.empty}
              >
                <ServiceIcon
                  name={'user-plus'}
                />
                <strong>
                  {managerUnit ? '관리소장 외에 추가할 주민이 있나요?' : '아직 추가한 주민이 없어요'}
                </strong>
                <p>
                  주민 정보를 입력하거나 엑셀 파일을 올려주세요.
                </p>
              </div>
            )}
          />
          <Pagination
            label={'주민 목록 페이지'}
            unit={'명'}
            total={roster.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </section>
        <div
          className={styles.notice}
        >
          <ServiceIcon
            name={'info'}
          />
          <p>
            주민 명부는 마지막 확인 단계에서 함께 저장돼요.
          </p>
        </div>
        <footer
          className={styles.actions}
        >
          <p>
            {error || `총 ${total}명의 주민을 등록할 준비가 되었어요.`}
          </p>
          <div>
            <Button
              variant={'outline'}
              onClick={onPrevious}
            >
              이전
            </Button>
            <Button
              onClick={() => { if (!error) onNext(); }}
              disabled={Boolean(error)}
              trailingIcon={(
                <ServiceIcon
                  name={'chevron'}
                  direction={'right'}
                />
              )}
            >
              다음
            </Button>
          </div>
        </footer>
      </section>
    </main>
  );
}
