'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CURRENT_USER_QUERY_KEY,
  updateCurrentUserDisplayName,
  saveCurrentUserProfile,
  ProfileAvatar,
  useSession,
  type CurrentUser
} from '@/entities/session';
import { ServiceHeader } from '@/widgets/service-header';
import { ManagementNavigation } from '@/widgets/management-layout';
import { useManagementEntry } from '@/features/enter-service';
import { getManagementDashboardPath } from '@/entities/property';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/form-controls';
import { ImageCropDialog } from '@/shared/ui/image-crop-dialog';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { LoadingState } from '@/shared/ui/state-message';
import { Toast } from '@/shared/ui/toast';
import {
  getDisplayNameError,
  getProfileImageError
} from '../model/account';
import styles from './accountPage.module.css';
import { AccountWithdrawal } from './_components/account-withdrawal/accountWithdrawal';

/** 관리대상 소속과 무관하게 로그인한 본인의 계정 정보를 조회합니다. */
export function AccountPage() {
  const session = useSession();
  const management = useManagementEntry(session.data?.id);
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const denied = session.error instanceof ApiError
    && (session.error.status === 401 || session.error.code === 'ACCOUNT_UNAVAILABLE');

  useEffect(() => {
    if (denied) router.replace('/login');
  }, [denied, router]);

  useEffect(() => {
    // 브라우저 기록 캐시가 로그아웃 전 계정 정보를 다시 표시하지 않도록 복원 시 현재 세션을 조회합니다.
    function hideLeavingPage() {
      if (!pageRef.current) return;
      pageRef.current.hidden = true;
      pageRef.current.inert = true;
    }
    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener('pagehide', hideLeavingPage);
    window.addEventListener('pageshow', restorePage);
    return () => {
      window.removeEventListener('pagehide', hideLeavingPage);
      window.removeEventListener('pageshow', restorePage);
    };
  }, []);

  let content;
  if (session.isPending || denied) {
    content = (
      <LoadingState
        title={'계정 정보를 확인하고 있어요.'}
      />
    );
  } else if (session.isError) {
    content = (
      <RequestError
        error={session.error}
        retrying={session.isFetching}
        onRetry={() => void session.refetch({
          cancelRefetch: false
        })}
      />
    );
  } else {
    content = (
      <AccountDetails
        key={session.data.id}
        user={session.data}
      />
    );
  }

  return (
    <div
      ref={pageRef}
    >
      <ServiceHeader
        homeHref={management.data ? getManagementDashboardPath(management.data.propertyId) : '/properties'}
        homeLabel={management.data ? '대시보드' : '참여 중인 곳'}
        mobileContent={management.data ? (onNavigate) => (
          <ManagementNavigation
            propertyId={management.data.propertyId}
            variant={'drawer'}
            onNavigate={onNavigate}
          />
        ) : undefined}
        mobileBack={{
          href: '/start',
          label: '뒤로가기',
          title: '내 정보'
        }}
      />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={''}
          title={'내 정보'}
          titleId={'account-title'}
          description={'모아홈에서 사용하는 이름과 프로필 사진을 관리하세요.'}
        />
        {content}
      </main>
    </div>
  );
}

/** 조회 화면에서 명시적으로 편집하고 이름·크롭 사진의 저장 결과를 전역 헤더에 함께 반영합니다. */
function AccountDetails({ user }: { user: CurrentUser }) {
  const cache = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState('');
  const [displayName, setDisplayName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoErrorVersion, setPhotoErrorVersion] = useState(0);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const preparing = cropFile !== null;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const validation = getDisplayNameError(displayName);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  /** 검증한 파일은 공통 크롭 모달로 보내며 취소하면 이전 사진 초안을 그대로 유지합니다. */
  function selectPhoto(file: File | undefined) {
    if (!file || busy || preparing) return;
    setPhotoError('');
    const failure = getProfileImageError(file);
    if (failure) {
      setPhotoErrorVersion((value) => value + 1);
      setPhotoError(failure);
      return;
    }
    setCropFile(file);
  }

  /** 취소 시 저장 전 입력을 폐기하고 조회 화면의 수정 버튼으로 포커스를 돌려줍니다. */
  function finishEditing() {
    setEditing(false);
    setError('');
    setPhoto(null);
    setRemoveImage(false);
    setCropFile(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  /** 서버 저장이 성공한 경우에만 캐시를 바꾸며 실패하면 현재 입력으로 다시 시도할 수 있습니다. */
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || validation || preparing) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setPhotoError('');
    try {
      const updated = photo || removeImage
        ? await saveCurrentUserProfile(displayName.trim(), photo?.file ?? null, removeImage)
        : await updateCurrentUserDisplayName(displayName.trim());
      if (updated.id !== user.id) throw new ApiError(200, 'INVALID_RESPONSE', '계정 정보를 확인할 수 없습니다.');
      // 저장 중 계정이 바뀌면 이전 계정의 늦은 응답을 새 세션에 덮어쓰지 않습니다.
      if (cache.getQueryData<CurrentUser>(CURRENT_USER_QUERY_KEY)?.id !== user.id) return;
      cache.setQueryData(CURRENT_USER_QUERY_KEY, updated);
      finishEditing();
      setSaved(photo || removeImage ? '프로필을 변경했어요.' : '이름을 변경했어요.');
    } catch (failure) {
      if (failure instanceof ApiError && (failure.status === 401 || failure.code === 'ACCOUNT_UNAVAILABLE')) {
        router.replace('/login');
        return;
      }
      if (photo || removeImage) {
        setPhotoError(failure instanceof ApiError && failure.code === 'PROFILE_IMAGE_TOO_LARGE'
          ? '사진은 5MB 이하로 선택해주세요.'
          : '프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      setError(failure instanceof ApiError && failure.code === 'INVALID_REQUEST'
        ? '이름을 1~50자로 입력해주세요.'
        : '이름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const avatar = (
    <span
      className={styles.avatar}
    >
      <ProfileAvatar
        imageUrl={photo?.url ?? (removeImage ? null : user.profileImageUrl)}
        alt={'프로필 사진'}
        size={120}
      />
    </span>
  );

  return (
    <>
      <section
        className={styles.section}
        aria-labelledby={'basic-info-title'}
      >
        <h2
          id={'basic-info-title'}
        >
          기본정보
        </h2>
        <ListCard>
          <div
            className={styles.identity}
          >
            {editing ? (
              <Button
                className={styles['avatar-button']}
                variant={'ghost'}
                aria-label={'사진 변경'}
                disabled={busy}
                onClick={() => photoInputRef.current?.click()}
              >
                {avatar}
                <span
                  className={styles['avatar-edit-icon']}
                  aria-hidden
                >
                  <ServiceIcon
                    name={'pen'}
                    size={18}
                  />
                </span>
              </Button>
            ) : avatar}
            {editing && (
              <div
                className={styles['photo-editor']}
              >
                <input
                  ref={photoInputRef}
                  type={'file'}
                  accept={'image/png,image/jpeg'}
                  aria-label={'프로필 사진 파일'}
                  hidden
                  disabled={busy || preparing}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void selectPhoto(file);
                  }}
                />
                <div
                  className={styles['photo-actions']}
                >
                  {(photo || (!removeImage && user.profileImageUrl)) && (
                    <Button
                      variant={'outline'}
                      tone={'danger'}
                      size={'sm'}
                      disabled={busy || preparing}
                      onClick={() => {
                        setPhoto(null);
                        setRemoveImage(Boolean(user.profileImageUrl));
                      }}
                    >
                      사진 삭제
                    </Button>
                  )}
                </div>
                <p>
                  PNG·JPEG, 최대 5MB
                </p>
              </div>
            )}
            {!editing && (
              <strong
                className={styles.name}
              >
                {user.displayName}
              </strong>
            )}
          </div>
          {editing ? (
            <form
              onSubmit={(event) => void save(event)}
              noValidate
            >
              <fieldset
                className={styles.fields}
                disabled={busy || preparing}
              >
                <Input
                  ref={inputRef}
                  label={'이름'}
                  value={displayName}
                  autoComplete={'nickname'}
                  description={'모아홈에서 사용하는 이름입니다. 주민 명부의 이름은 변경되지 않습니다.'}
                  error={validation || undefined}
                  required
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                {error && (
                  <p
                    className={styles.error}
                    role={'alert'}
                  >
                    {error}
                  </p>
                )}
                <div
                  className={styles.actions}
                >
                  <Button
                    variant={'outline'}
                    onClick={finishEditing}
                  >
                    취소
                  </Button>
                  <Button
                    type={'submit'}
                    loading={busy}
                    disabled={Boolean(validation)}
                  >
                    저장
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div
              className={styles.actions}
            >
              <Button
                ref={editButtonRef}
                onClick={() => {
                  setSaved('');
                  setPhotoError('');
                  setDisplayName(user.displayName);
                  setEditing(true);
                }}
              >
                수정
              </Button>
            </div>
          )}
        </ListCard>
        {cropFile && (
          <ImageCropDialog
            file={cropFile}
            onClose={() => setCropFile(null)}
            onApply={(blob) => {
              const file = new File([blob], 'profile.png', {
                type: 'image/png'
              });
              setPhoto({
                file,
                url: URL.createObjectURL(file)
              });
              setRemoveImage(false);
              setCropFile(null);
            }}
          />
        )}
        {saved && (
          <Toast
            message={saved}
            onClose={() => setSaved('')}
          />
        )}
        {photoError && (
          <Toast
            key={photoErrorVersion}
            tone={'error'}
            message={photoError}
            onClose={() => setPhotoError('')}
          />
        )}
      </section>
      <AccountWithdrawal
        userId={user.id}
        disabled={busy || preparing}
      />
    </>
  );
}
