'use client';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS,
  formatResidentPhone
} from '@/entities/resident';
import { Button } from '@/shared/ui/button';
import { DetailActions } from '@/shared/ui/detail-actions';
import { ClientModal } from '@/shared/ui/client-modal';
import { Dropdown } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  deleteResident,
  getResidentDetail,
  revealResidentPhone
} from '../../api/residentManagementApi';
import { getResidentManagementError } from '../../model/residentManagement';
import { ResidentRegistrationForm } from '../resident-registration-form/residentRegistrationForm';
import styles from './residentDetails.module.css';

/** 웹 모달·모바일 페이지에서 같은 상세·수정·삭제를 사용하고 공개 번호는 이 컴포넌트의 일시 상태에만 둡니다. */
export function ResidentDetails({ propertyId, residentId, presentation = 'modal', onClose, onDeleted, canPromote = false }: {
  propertyId: string;
  residentId: string;
  presentation?: 'modal' | 'page';
  onClose: () => void;
  onDeleted: () => void;
  canPromote?: boolean;
}) {
  const session = useSession();
  const client = useQueryClient();
  const queryKey = ['resident-detail', session.data?.id, propertyId, residentId];
  const query = useQuery({
    queryKey,
    queryFn: () => getResidentDetail(propertyId, residentId),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
  const [mode, setMode] = useState<'detail' | 'edit' | 'delete'>('detail');
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [replacement, setReplacement] = useState('');
  const active = useRef(false);
  const pending = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const resident = query.data;
  const canModify = Boolean(resident && (resident.serviceRole !== 'ADMIN' || canPromote));
  const Title = presentation === 'page' ? 'h1' : 'h2';
  const title = mode === 'edit' ? '주민 수정' : mode === 'delete' ? '주민 삭제' : '주민 상세';

  /** 숨기기·수정·삭제 전환에서는 공개 번호를 즉시 버리고 조회 실패에도 기존 마스킹을 유지합니다. */
  async function togglePhone() {
    if (phone !== null) { setPhone(null); return; }
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      const revealed = await revealResidentPhone(propertyId, residentId);
      if (active.current) setPhone(revealed);
    } catch (failure) {
      if (active.current) setError(getResidentManagementError(failure));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  function changeMode(next: typeof mode) {
    setPhone(null); setError(''); setMessage(''); setReplacement(''); setMode(next);
  }

  /** 대표 선택을 먼저 검증하며 실패는 상세·선택을 유지하고 성공에만 목록으로 복귀합니다. */
  async function confirmDelete() {
    if (!resident || pending.current) return;
    if (resident.representativeCandidates.length && !replacement) {
      setError('남은 주민 중 새 대표를 선택해주세요.'); return;
    }
    pending.current = true;
    setBusy(true); setError('');
    try {
      await deleteResident(propertyId, residentId, resident.updatedAt, replacement || null);
      if (!active.current) return;
      void client.invalidateQueries({
        predicate: (query) => ['property-residents', 'property-units'].includes(String(query.queryKey[0]))
      });
      onDeleted();
    } catch (failure) {
      if (active.current) setError(getResidentManagementError(failure));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const content = (
    <>
      <header
        className={styles.header}
      >
        <Title
          id={'resident-detail-title'}
          ref={titleRef}
          tabIndex={-1}
        >
          {title}
        </Title>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'주민 상세 닫기'}
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
      {query.isPending && (
        <p
          role={'status'}
        >
          주민 정보를 불러오고 있어요.
        </p>
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      )}
      {resident && mode === 'detail' && (
        <>
          <dl
            className={styles.fields}
          >
            <div>
              <dt>
                주민명
              </dt>
              <dd>
                {resident.name}
              </dd>
            </div>
            <div>
              <dt>
                연락처
              </dt>
              <dd
                className={styles.phone}
              >
                <span>
                  {phone !== null ? formatResidentPhone(phone) : resident.phoneLast4 ? `•••• ${resident.phoneLast4}` : '—'}
                </span>
                {resident.phoneLast4 && (
                  <Button
                    size={'sm'}
                    variant={'outline'}
                    loading={busy}
                    aria-pressed={phone !== null}
                    onClick={() => void togglePhone()}
                  >
                    {phone !== null ? '번호 숨기기' : '전체 번호 보기'}
                  </Button>
                )}
              </dd>
            </div>
            <div>
              <dt>
                동·호수
              </dt>
              <dd>
                {resident.unitNumber ? `${resident.buildingName ? `${resident.buildingName} ` : ''}${/호$/.test(resident.unitNumber) ? resident.unitNumber : `${resident.unitNumber}호`}` : '현재 소속 없음'}
              </dd>
            </div>
            <div>
              <dt>
                주민 구분
              </dt>
              <dd>
                {RESIDENT_RELATION_OPTIONS.find((item) => item.value === resident.relationType)?.label ?? '—'}
              </dd>
            </div>
            <div>
              <dt>
                대표 주민
              </dt>
              <dd>
                {resident.representative ? '대표' : '—'}
              </dd>
            </div>
            <div>
              <dt>
                역할
              </dt>
              <dd>
                {resident.serviceRole === 'ADMIN' ? '관리소장' : resident.serviceRole === 'MANAGER' ? '부담당자' : resident.serviceRole === 'RESIDENT' ? '주민' : resident.serviceRole === 'CONFLICT' ? '권한 확인 필요' : '—'}
              </dd>
            </div>
            <div>
              <dt>
                가입 상태
              </dt>
              <dd>
                {RESIDENT_SIGNUP_OPTIONS.find((item) => item.value === resident.signupStatus)?.label}
              </dd>
            </div>
            <div>
              <dt>
                등록일
              </dt>
              <dd>
                {new Date(resident.createdAt).toLocaleDateString('ko-KR')}
              </dd>
            </div>
          </dl>
          {canModify && (
            <DetailActions
              presentation={presentation}
              onClose={onClose}
              onEdit={() => changeMode('edit')}
              onDelete={() => changeMode('delete')}
              busy={busy}
            />
          )}
        </>
      )}
      {resident && canModify && mode === 'edit' && (
        <ResidentRegistrationForm
          canPromote={canPromote}
          key={resident.updatedAt}
          propertyId={propertyId}
          resident={resident}
          onBusyChange={setBusy}
          onCancel={() => { changeMode('detail'); void query.refetch(); }}
          onSaved={(saved) => {
            setBusy(false);
            if (saved) client.setQueryData(queryKey, saved);
            void client.invalidateQueries({
              predicate: (query) => ['property-residents', 'property-units'].includes(String(query.queryKey[0]))
            });
            changeMode('detail'); setMessage('주민 정보를 수정했어요.');
          }}
        />
      )}
      {resident && canModify && mode === 'delete' && (
        <div
          className={styles.state}
        >
          <p>
            <strong>
              {resident.name}
            </strong>
            {' '}
            주민을 삭제하시겠습니까?
          </p>
          <p>
            주민 목록에서 제외하고 해당 관리대상의 주민 접근권한을 종료합니다.
          </p>
          {resident.representativeCandidates.length > 0 && (
            <Dropdown
              label={'새 대표 주민'}
              required
              value={replacement}
              disabled={busy}
              options={resident.representativeCandidates.map((item) => ({
                value: item.id,
                label: item.name
              }))}
              onChange={setReplacement}
              placeholder={'남은 주민 중 선택해주세요'}
            />
          )}
          <footer
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => changeMode('detail')}
            >
              취소
            </Button>
            <Button
              variant={'outline'}
              tone={'danger'}
              loading={busy}
              onClick={() => void confirmDelete()}
            >
              삭제
            </Button>
          </footer>
        </div>
      )}
      {error && (
        <p
          className={styles.error}
          role={'alert'}
        >
          {error}
        </p>
      )}
      {message && (
        <Toast
          key={message}
          message={message}
          onClose={() => setMessage('')}
        />
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'resident-detail-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'resident-detail-title'}
      initialFocusRef={titleRef}
      busy={busy}
      onClose={onClose}
    >
      {content}
    </ClientModal>
  );
}
