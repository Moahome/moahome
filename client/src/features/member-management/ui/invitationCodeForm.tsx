'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HomeIllustration } from '@/shared/ui/home-illustration';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { useSession } from '@/entities/session';
import { isServerConnectionError } from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
import {
  requestMemberInvitation,
  memberManagementError
} from '../api/memberApi';
import {
  getResidentJoinOptions,
  previewResidentInvitation,
  acceptResidentInvitation,
  submitResidentJoin
} from '../api/residentInvitationApi';
import type {
  ResidentJoinOptions,
  ResidentInvitationPreview
} from '../api/residentInvitationApiTypes';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import styles from './invitationCodeForm.module.css';

/** 링크 fragment는 서버에 보내지 않고 클라이언트에서만 구독해 가입 폼을 바로 엽니다. */
function subscribeFragment(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}
function readFragment() {
  try {
    const value = decodeURIComponent(window.location.hash.slice(1));
    return /^[RB](?:-[A-HJ-NP-Z2-9]{4}){3}$/i.test(value) ? value : '';
  } catch { return ''; }
}

interface InvitationCodeFormProps {
  onBusyChange?: (busy: boolean) => void;
  onComplete?: () => void;
  propertyId?: string;
  responsive?: boolean;
  onClose?: () => void;
}

function subscribeDesktop(notify: () => void) {
  const media = window.matchMedia('(min-width: 768px)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
function readDesktop() { return window.matchMedia('(min-width: 768px)').matches; }

/** 직접 코드 입력도 PC에서는 공통 모달을 사용하고, 초대 링크는 입력 단계를 건너뜁니다. */
export function InvitationCodeForm(props: InvitationCodeFormProps) {
  const desktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  const incoming = useSyncExternalStore(subscribeFragment, readFragment, () => '');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [openedFromLink] = useState(() => typeof window !== 'undefined' && Boolean(readFragment()));
  const modal = props.responsive && desktop && !incoming && !openedFromLink;
  if (!modal) return (
    <InvitationCodeContent
      {...props}
      showHeading={props.responsive}
    />
  );
  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'invitation-entry-title'}
      initialFocusRef={heading}
      busy={busy}
      onClose={() => props.onClose?.()}
    >
      <header
        className={styles['modal-header']}
      >
        <h2
          id={'invitation-entry-title'}
          ref={heading}
          tabIndex={-1}
        >
          초대코드로 참여하기
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'초대코드 입력 닫기'}
          disabled={busy}
          onClick={props.onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <InvitationCodeContent
        {...props}
        onBusyChange={setBusy}
      />
    </ClientModal>
  );
}

/** 코드 검증 후 일반 신청과 개인 정보 확인을 구분하며 원문은 메모리에만 보관합니다. */
function InvitationCodeContent({ onBusyChange, onComplete, propertyId, showHeading }: InvitationCodeFormProps & { showHeading?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const incoming = useSyncExternalStore(subscribeFragment, readFragment, () => '');
  const [inputCode, setCode] = useState('');
  const code = inputCode || incoming;
  const currentUser = session.data;
  const [options, setOptions] = useState<ResidentJoinOptions | null>(null);
  const [preview, setPreview] = useState<ResidentInvitationPreview | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneAction, setPhoneAction] = useState('KEEP');
  const [correction, setCorrection] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [linkError, setLinkError] = useState(false);
  const openingLink = Boolean(incoming && !options && !preview && !result && !linkError);
  const linkOpened = useRef(false);
  const loginStarted = useRef(false);



  useEffect(() => {
    /** 로그인 창을 직접 연 뒤 돌아오면 새 문서에서 세션을 복원합니다. 이전 인증 실패 메모리를 임의 해제하지 않습니다. */
    function restoreLogin() {
      if (!currentUser && loginStarted.current) window.location.reload();
    }
    window.addEventListener('focus', restoreLogin);
    return () => window.removeEventListener('focus', restoreLogin);
  }, [currentUser]);

  useEffect(() => {
    if (!openingLink || !currentUser || !code || linkOpened.current) return;
    linkOpened.current = true;
    /** 링크에 담긴 코드는 자동 검증해 입력 화면을 건너뛰고 가입·정보 확인 화면을 바로 엽니다. */
    async function openLink() {
      setBusy(true);
      onBusyChange?.(true);
      try {
        if (/^B-/i.test(code)) {
          const value = await getResidentJoinOptions(code);
          if (propertyId && value.propertyId !== propertyId) throw new Error('Invalid invitation');
          setOptions(value);
        } else {
          const value = await previewResidentInvitation(code);
          setPreview(value);
          setName(value.name);
          if (value.status === 'APPROVED') setResult('주민 가입이 완료되었어요.');
          if (value.status === 'CHANGE_REQUESTED') setResult('정보 정정을 요청했어요. 관리자 확인 후 가입이 완료됩니다.');
        }
      } catch (failure) { setError(memberManagementError(failure)); setLinkError(true); }
      finally { setBusy(false); onBusyChange?.(false); }
    }
    void openLink();
  }, [openingLink, currentUser, code, propertyId, onBusyChange]);

  /** 검증 성공 전에는 명부·권한을 변경하지 않으며 선택 연락처가 비어 있으면 null로 보냅니다. */
  async function submit() {
    if (pending.current || !code.trim() || !session.data) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      if (options) {
        await submitResidentJoin(options.propertyId, {
          code,
          name: name.trim(),
          unitId: unit,
          phone: phone.trim() || null
        });
        setResult('가입을 신청했어요. 관리자의 승인을 기다려주세요.');
      } else if (preview) {
        const response = await acceptResidentInvitation({
          token: code,
          correction,
          ...(correction ? {
            name: name.trim(),
            phoneAction: phoneAction as 'KEEP' | 'SET' | 'REMOVE',
            ...(phoneAction === 'SET' ? {
              phone
            } : {})
          } : {})
        });
        setResult(response.status === 'APPROVED' ? '주민 가입이 완료되었어요.' : '정보 정정을 요청했어요. 관리자 확인 후 가입이 완료됩니다.');
      } else if (/^B[A-HJ-NP-Z2-9]{12}$/i.test(code.trim().replaceAll('-', ''))) {
        const value = await getResidentJoinOptions(code);
        if (propertyId && value.propertyId !== propertyId) throw new Error('다른 관리대상의 초대코드입니다.');
        setOptions(value);
      } else if (/^R[A-HJ-NP-Z2-9]{12}$/i.test(code.trim().replaceAll('-', ''))) {
        const value = await previewResidentInvitation(code);
        setPreview(value);
        setName(value.name);
        if (value.status === 'APPROVED') setResult('주민 가입이 완료되었어요.');
        if (value.status === 'CHANGE_REQUESTED') setResult('정보 정정을 요청했어요. 관리자 확인 후 가입이 완료됩니다.');
      } else {
        const response = await requestMemberInvitation(code);
        setResult(`${response.propertyName}에 참여를 신청했어요. 관리소장의 승인을 기다려주세요.`);
      }
      if (options || preview || !/^[RB]-/i.test(code.trim())) {
        setCode('');
        setPhone('');
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (failure) {
      setError(memberManagementError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  if (result) return (
    <div
      className={styles.form}
      role={'status'}
    >
      <p>
        {result}
      </p>
      {(onComplete || result === '주민 가입이 완료되었어요.') && (
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            onClick={result === '주민 가입이 완료되었어요.' ? () => router.push('/resident') : onComplete}
          >
            {result === '주민 가입이 완료되었어요.' ? '주민 홈으로' : '확인'}
          </Button>
        </div>
      )}
    </div>
  );

  if (!session.data && (session.isPending || session.isFetching)) return (
    <p
      role={'status'}
    >
      로그인 정보를 확인하고 있어요.
    </p>
  );

  if (!session.data && session.isError && isServerConnectionError(session.error)) return (
    <ServerConnectionError
      onRetry={() => void session.refetch({
        cancelRefetch: false
      })}
    />
  );

  if (!session.data) return (
    <div
      className={styles.form}
    >
      <p>
        카카오 로그인이 필요해요. 로그인한 뒤 이 화면에서 가입을 계속할 수 있어요.
      </p>
      <Link
        href={'/login'}
        target={'_blank'}
        rel={'noopener noreferrer'}
        onClick={() => { loginStarted.current = true; }}
      >
        카카오 로그인
      </Link>
      <Button
        variant={'outline'}
        onClick={() => window.location.reload()}
      >
        로그인 확인
      </Button>
    </div>
  );

  if (openingLink) return (
    <p
      role={'status'}
    >
      초대를 확인하고 있어요.
    </p>
  );

  return (
    <>
      {showHeading && (
        <header
          className={styles.heading}
        >
          <div>
            <span
              className={styles.eyebrow}
            >
              참여하기
            </span>
            <h1>
              주민으로 참여하기
            </h1>
            <p>
              {preview ? '초대된 주민 정보를 확인해주세요.' : options ? '가입에 필요한 정보를 입력해주세요.' : '관리자가 전달한 초대코드를 입력해주세요.'}
            </p>
          </div>
          <div
            className={styles.illustration}
          >
            <HomeIllustration
              kind={'create'}
              showAction={false}
            />
          </div>
        </header>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        {!options && !preview && (
          <Input
            label={'초대코드'}
            value={code}
            autoComplete={'off'}
            maxLength={100}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        )}
        {!options && !preview && (
          <p>
            공통·개인 초대코드는 발급 후 24시간 동안 유효합니다.
          </p>
        )}
        {options && (
          <>
            <strong>
              {options.propertyName}
            </strong>
            <Input
              label={'이름'}
              value={name}
              maxLength={50}
              autoComplete={'name'}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Dropdown
              label={'동·호수'}
              value={unit}
              options={options.units.map((item) => ({
                value: item.unitId,
                label: item.label
              }))}
              onChange={setUnit}
              disabled={busy}
              required
            />
            <Input
              label={'연락처 (선택)'}
              type={'tel'}
              value={phone}
              autoComplete={'tel'}
              placeholder={'010-1234-5678'}
              disabled={busy}
              onChange={(event) => setPhone(event.target.value)}
            />
            <p>
              연락처 없이도 신청할 수 있어요. 관리자가 명부를 확인한 뒤 승인합니다.
            </p>
          </>
        )}
        {preview && (
          <>
            <section
              className={styles['resident-card']}
              aria-label={'초대된 주민 정보'}
            >
              <div
                className={styles.property}
              >
                <ServiceIcon
                  name={'building'}
                />
                <strong>
                  {preview.propertyName}
                  {' '}
                  ·
                  {' '}
                  {preview.unitLabel}
                </strong>
              </div>
              <dl
                className={styles.details}
              >
                <div>
                  <dt>
                    <ServiceIcon
                      name={'person'}
                    />
                    이름
                  </dt>
                  <dd>
                    {preview.name}
                  </dd>
                </div>
                <div>
                  <dt>
                    <ServiceIcon
                      name={'phone'}
                    />
                    연락처
                  </dt>
                  <dd>
                    {preview.phoneLast4 ? `•••• ${preview.phoneLast4}` : '미등록'}
                  </dd>
                </div>
              </dl>
            </section>
            <div
              className={styles.notice}
            >
              <ServiceIcon
                name={'info'}
              />
              <p>
                본인 정보가 맞으면 바로 가입할 수 있어요.
                <br />
                다른 사람의 초대나 동·호수가 다르면 담당자에게 문의해주세요.
              </p>
            </div>
            {correction && (
              <>
                <Input
                  label={'이름'}
                  value={name}
                  maxLength={50}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Dropdown
                  label={'연락처 변경'}
                  value={phoneAction}
                  options={[{
                    value: 'KEEP',
                    label: '기존 연락처 유지'
                  }, {
                    value: 'SET',
                    label: '연락처 입력·변경'
                  }, {
                    value: 'REMOVE',
                    label: '연락처 없음'
                  }]}
                  onChange={setPhoneAction}
                  disabled={busy}
                />
                {phoneAction === 'SET' && (
                  <Input
                    label={'변경할 연락처'}
                    type={'tel'}
                    value={phone}
                    disabled={busy}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                )}
                <p>
                  정정 요청은 관리자가 확인한 뒤 명부에 반영하고 가입을 승인합니다.
                </p>
              </>
            )}
          </>
        )}
        {error && (
          <p
            role={'alert'}
          >
            {error}
          </p>
        )}
        <div
          className={`${styles.actions} ${preview ? styles['resident-actions'] : ''}`}
        >
          {preview && !correction && (
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => setCorrection(true)}
            >
              수정
            </Button>
          )}
          <Button
            variant={preview ? 'primary' : 'outline'}
            type={'submit'}
            loading={busy}
          >
            {options ? '가입 신청' : preview ? (correction ? '수정' : '참여하기') : '참여 신청'}
          </Button>
        </div>
      </form>
    </>
  );
}
