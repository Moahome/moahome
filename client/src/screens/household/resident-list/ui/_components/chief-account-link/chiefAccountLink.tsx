'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { linkOwnChiefResident } from '@/features/member-management';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Dropdown } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRef,
  useState
} from 'react';
import type { ResidentList } from '../../../api/residentApiTypes';
import styles from './chiefAccountLink.module.css';

/** 현재 로그인한 관리소장 본인을 명부와 연결하고 저장 성공 뒤 최신 명부로 역할·가입 상태를 갱신합니다. */
export function ChiefAccountLink({ propertyId, data, presentation = 'modal', onClose, onLinked }: {
  propertyId: string;
  data: ResidentList;
  presentation?: 'modal' | 'page';
  onClose: () => void;
  onLinked: () => void;
}) {
  const session = useSession();
  const client = useQueryClient();
  const pending = useRef(false);
  const context = useManagementContext(session.data?.id, propertyId, false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [residentId, setResidentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const candidates = data.residents.filter((resident) => resident.unitId && resident.signupStatus !== 'APPROVED' && (!resident.serviceRole || resident.serviceRole === 'ADMIN'));
  const selected = candidates.find((resident) => resident.id === residentId);
  const chief = data.residents.find((resident) => resident.serviceRole === 'ADMIN' && resident.signupStatus === 'APPROVED');
  const administrator = context.data?.role === 'ADMIN';

  /** 중복 클릭을 막고 실패하면 선택을 유지합니다. 응답 유실 후 같은 본인 연결 재시도는 서버에서 중복 저장하지 않습니다. */
  async function connectAccount() {
    if (!administrator || !selected?.unitId || pending.current) return;
    pending.current = true;
    setBusy(true);
    setErrorMessage('');
    try {
      await linkOwnChiefResident(propertyId, selected.id, selected.unitId);
      await client.invalidateQueries({
        predicate: (query) =>
          ['property-residents', 'property-units', 'property-members', 'resident-detail'].includes(String(query.queryKey[0]))
        && query.queryKey.includes(propertyId)
      });
      onLinked();
    } catch (error) {
      const messages: Record<string, string> = {
        MEMBER_ROLE_CONFLICT: '이미 연결된 계정이 있거나 주민 정보가 변경됐어요. 최신 명부를 확인해주세요.',
        MEMBER_RESIDENT_REQUIRED: '현재 거주 세대가 연결된 주민을 선택해주세요.',
        MEMBER_NOT_FOUND: '연결할 주민을 찾을 수 없어요. 최신 명부를 확인해주세요.',
        ACCESS_DENIED: '현재 관리소장만 본인 계정을 연결할 수 있어요.',
        ACCOUNT_UNAVAILABLE: '현재 계정으로 연결할 수 없어요.',
        INVALID_REQUEST: '연결할 주민과 거주 세대를 확인해주세요.'
      };
      setErrorMessage(error instanceof ApiError ? messages[error.code] ?? '계정을 연결하지 못했어요. 다시 시도해주세요.' : '계정을 연결하지 못했어요. 다시 시도해주세요.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function unitLabel(resident: ResidentList['residents'][number]) {
    const building = data.hasBuildings ? data.buildings.find((item) => item.id === resident.buildingId)?.name : '';
    return [building, resident.unitNumber ? `${resident.unitNumber}호` : '세대 미연결'].filter(Boolean).join(' ');
  }

  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <h2
            ref={titleRef}
            tabIndex={-1}
            id={'chief-account-link-title'}
          >
            내 관리소장 계정 연결
          </h2>
          <p>
            주민 명부에서 본인의 정보를 선택해 계정을 연결하세요.
          </p>
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'계정 연결 닫기'}
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
      <div
        className={styles.account}
      >
        <span
          className={styles.icon}
        >
          <ServiceIcon
            name={'users'}
          />
        </span>
        <div>
          <span>
            현재 로그인 계정
          </span>
          <strong>
            {session.data?.displayName ?? '로그인 계정'}
          </strong>
        </div>
        <span
          className={styles.role}
        >
          관리소장
        </span>
      </div>
      {!administrator && (
        <LoadingState
          title={'관리소장 계정을 확인하고 있어요.'}
        />
      )}
      {administrator && chief && (
        <p>
          이미 주민 목록의
          {chief.name}
          {' '}
          ·
          {unitLabel(chief)}
          에 관리소장 역할이 연결되어 있어요.
        </p>
      )}
      {administrator && !chief && <>
        <Dropdown
          label={'주민 명부의 본인'}
          placeholder={'본인의 주민 정보를 선택해주세요'}
          value={residentId}
          disabled={busy}
          options={candidates.map((resident) => ({
            value: resident.id,
            label: `${resident.name} · ${unitLabel(resident)}${resident.phoneLast4 ? ` · 연락처 끝 ${resident.phoneLast4}` : ''}`
          }))}
          onChange={(value) => { setResidentId(value); setErrorMessage(''); }}
        />
        {!candidates.length && (
          <p
            className={styles.description}
          >
            연결할 주민 정보가 없어요. 주민 목록에서 본인의 이름과 거주 세대를 먼저 등록해주세요.
          </p>
        )}
        {selected && (
          <section
            className={styles.result}
            aria-label={'연결할 주민 정보'}
          >
            <h3>
              연결할 주민
            </h3>
            <dl>
              <div>
                <dt>
                  이름
                </dt>
                <dd>
                  {selected.name}
                </dd>
              </div>
              <div>
                <dt>
                  거주 세대
                </dt>
                <dd>
                  {unitLabel(selected)}
                </dd>
              </div>
              <div>
                <dt>
                  역할
                </dt>
                <dd>
                  <span
                    className={styles.role}
                  >
                    관리소장
                  </span>
                </dd>
              </div>
              <div>
                <dt>
                  세대 대표
                </dt>
                <dd>
                  {selected.representative ? '대표 유지' : '대표 아님 (유지)'}
                </dd>
              </div>
            </dl>
          </section>
        )}
        <p
          className={styles.notice}
        >
          <ServiceIcon
            name={'info'}
          />
          관리소장 역할은 유지하며 세대 대표 여부는 변경하지 않습니다.
        </p>
      </>}
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
        {presentation === 'modal' && (
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </Button>
        )}
        {administrator && !chief && (
          <Button
            disabled={!selected || busy}
            onClick={() => void connectAccount()}
          >
            {busy ? '연결 중' : '계정 연결'}
          </Button>
        )}
      </footer>
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
    >
      {content}
    </section>
  );
  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'chief-account-link-title'}
      initialFocusRef={titleRef}
      onClose={onClose}
      busy={busy}
    >
      {content}
    </ClientModal>
  );
}
