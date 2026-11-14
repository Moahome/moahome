'use client';

import {
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Input } from '@/shared/ui/form-controls';
import {
  goBackToPreviousRoute,
  goBackToRoute
} from '@/shared/lib/navigation-history';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { Toast } from '@/shared/ui/toast';
import {
  deleteNotice,
  getNotice,
  saveNotice
} from '../../../api/noticeApi';
import type {
  NoticeDetail,
  NoticePageProps,
  NoticeSaveRequest
} from '../../../model/noticeTypes';
import { NoticeAttachments } from '../notice-attachments/noticeAttachments';
import { NoticeEditor } from '../notice-editor/noticeEditor';
import { NoticeDraftControls } from '../notice-draft-controls/noticeDraftControls';
import { removeNoticeDraft } from '../../../model/noticeDraft';
import styles from './noticeArticle.module.css';

/** 같은 공지의 상세와 편집을 연결하고 현재 사용자·관리대상별로 조회 캐시를 격리합니다. */
export function NoticeArticle({ propertyId, noticeId, mode }: NoticePageProps) {
  const session = useSession();
  const query = useQuery({
    queryKey: ['notice', session.data?.id, propertyId, noticeId],
    queryFn: ({ signal }) => getNotice(propertyId, noticeId!, signal),
    enabled: Boolean(session.data && noticeId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity
  });

  if (mode === 'create') return (
    <NoticeComposer
      propertyId={propertyId}
      userId={session.data?.id ?? ''}
    />
  );
  if (query.isPending) return (
    <LoadingState
      title={'공지사항을 불러오고 있어요.'}
    />
  );
  if (query.isError) return (
    <RequestError
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
  if (mode === 'edit' && !query.data.canEdit) return (
    <StateMessage
      variant={'forbidden'}
      title={'작성자만 수정할 수 있어요.'}
    />
  );
  if (mode === 'edit') return (
    <NoticeComposer
      key={`${query.data.id}:${query.data.version}`}
      propertyId={propertyId}
      notice={query.data}
      userId={session.data?.id ?? ''}
    />
  );

  return (
    <NoticeReader
      propertyId={propertyId}
      notice={query.data}
    />
  );
}

/** 제출 당시 요청 ID·본문을 보관해 통신 재시도에서도 같은 작업을 반복하며 동시에 저장하지 않습니다. */
function NoticeComposer({ propertyId, notice, userId }: { propertyId: string; notice?: NoticeDetail; userId: string }) {
  const router = useRouter();
  const queries = useQueryClient();
  const [title, setTitle] = useState(notice?.title ?? '');
  const [content, setContent] = useState(notice?.content ?? '{"type":"doc","content":[{"type":"paragraph"}]}');
  const [important, setImportant] = useState(notice?.important ?? false);
  const [busy, setBusy] = useState(false);
  const [imageReading, setImageReading] = useState(false);
  const mediaJobs = useRef(0);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const submission = useRef<{ id: string; request: NoticeSaveRequest } | null>(null);
  const base = `/manage/${propertyId}/notices`;
  const draftKey = `${userId}:${propertyId}:${notice?.id ?? 'new'}`;

  /** 여러 파일 작업이 겹쳐도 모든 업로드가 끝나기 전에 게시·임시저장을 열지 않습니다. */
  function mediaBusyChanged(started: boolean) {
    mediaJobs.current = Math.max(0, mediaJobs.current + (started ? 1 : -1));
    setImageReading(mediaJobs.current > 0);
  }

  /** 저장 실패 원인이 통신이라면 입력을 잠그고 같은 요청의 재시도만 허용합니다. */
  async function submit() {
    if (lock.current || imageReading) return;
    if (!title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    const document = JSON.parse(content);
    if (!JSON.stringify(document).includes('"text":') && !JSON.stringify(document).includes('"type":"image"')) {
      setError('내용을 입력해주세요.');
      return;
    }
    if (!submission.current) submission.current = {
      id: notice?.id ?? crypto.randomUUID(),
      request: {
        requestId: crypto.randomUUID(),
        expectedVersion: notice?.version ?? 0,
        title: title.trim(),
        content,
        important
      }
    };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await saveNotice(propertyId, submission.current.id, submission.current.request);
      await queries.invalidateQueries({
        predicate: (query) => ['notices', 'notice'].includes(String(query.queryKey[0])) && query.queryKey[2] === propertyId
      });
      await removeNoticeDraft(draftKey).catch(() => {});
      router.replace(base);
    } catch (failure) {
      const unknown = !(failure instanceof ApiError) || failure.status === 0 || failure.status >= 500 || failure.code === 'INVALID_RESPONSE';
      setUncertain(unknown);
      if (!unknown) submission.current = null;
      setError(failure instanceof ApiError && failure.status === 409
        ? '다른 관리자가 내용을 변경했습니다. 최신 공지를 확인해주세요.'
        : unknown ? '저장 결과를 확인하지 못했어요. 다시 저장하면 같은 요청으로 결과를 확인합니다.' : '저장하지 못했어요. 입력 내용을 확인해주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.article}
    >
      <ListHeader
        menu={'공지사항'}
        title={notice ? '공지 수정' : '공지 작성'}
        description={notice ? '공지 내용을 수정합니다.' : '새로운 공지사항을 작성합니다.'}
        titleId={'notice-compose-title'}
      />
      <form
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <ListCard>
          <div
            className={styles['compose-top']}
          >
            <Input
              label={'제목'}
              placeholder={'공지 제목을 입력하세요.'}
              value={title}
              maxLength={200}
              required
              disabled={busy || uncertain}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label
              className={styles['importance-option']}
            >
              <span
                className={styles['importance-copy']}
              >
                <ServiceIcon
                  name={'star'}
                  size={20}
                />
                <span>
                  <strong>
                    고정
                  </strong>
                  <small>
                    목록 상단에 표시됩니다.
                  </small>
                </span>
              </span>
              <input
                type={'checkbox'}
                role={'switch'}
                aria-label={'고정'}
                checked={important}
                disabled={busy || uncertain}
                onChange={(event) => setImportant(event.target.checked)}
              />
              <span
                className={styles.switch}
                aria-hidden={'true'}
              />
            </label>
          </div>
          <div
            className={styles['body-field']}
          >
            <p
              id={'notice-content-label'}
            >
              내용
            </p>
            <NoticeEditor
              propertyId={propertyId}
              key={restored ? 'restored' : 'initial'}
              initialContent={content}
              disabled={busy || uncertain || imageReading}
              onChange={(next) => setContent((previous) => JSON.stringify({
                ...JSON.parse(next),
                files: JSON.parse(previous).files ?? []
              }))}
              onBusyChange={mediaBusyChanged}
            />
          </div>
          <NoticeAttachments
            propertyId={propertyId}
            content={content}
            disabled={busy || uncertain || imageReading}
            onChange={setContent}
            onBusyChange={mediaBusyChanged}
          />
        </ListCard>
        <div
          className={styles['compose-actions']}
        >
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={() => {
              if (!goBackToPreviousRoute()) router.replace(notice ? `${base}/${notice.id}` : base);
            }}
          >
            취소
          </Button>
          <NoticeDraftControls
            value={{
              key: draftKey,
              title,
              content,
              important,
              savedAt: '',
              submission: null
            }}
            disabled={busy || imageReading}
            baseline={{
              title: notice?.title ?? '',
              content: notice?.content ?? '{"type":"doc","content":[{"type":"paragraph"}]}',
              important: notice?.important ?? false
            }}
            getSubmission={() => submission.current}
            onRestore={(draft) => {
              setTitle(draft.title);
              setContent(draft.content);
              setImportant(draft.important);
              submission.current = draft.submission;
              setUncertain(Boolean(draft.submission));
              setRestored((value) => !value);
            }}
          >
            <Button
              type={'submit'}
              variant={notice ? 'outline' : 'primary'}
              tone={notice ? 'success' : undefined}
              loading={busy}
              disabled={imageReading}
            >
              {uncertain ? '다시 저장' : notice ? '변경 저장' : '공지 등록'}
            </Button>
          </NoticeDraftControls>

        </div>
      </form>
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}

    </div>
  );
}

/** 상세의 제목·작성 정보·본문과 작성자 전용 관리 행동을 공통 카드로 구성합니다. */
function NoticeReader({ propertyId, notice }: { propertyId: string; notice: NoticeDetail }) {
  const router = useRouter();
  const queries = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const base = `/manage/${propertyId}/notices`;

  /** 삭제는 작성자에게만 제공하고 동일한 글·버전으로 재시도합니다. */
  async function remove() {
    if (lock.current || !notice.canEdit) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteNotice(propertyId, notice.id, notice.version);
      queries.removeQueries({
        predicate: (query) => query.queryKey[0] === 'notice' && query.queryKey[2] === propertyId && query.queryKey[3] === notice.id
      });
      await queries.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'notices' && query.queryKey[2] === propertyId
      });
      router.replace(base);
    } catch {
      setError('삭제 결과를 확인하지 못했어요. 같은 공지를 다시 확인해주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  /** 방문한 목록의 조회 조건을 복원하고 직접 진입한 경우에는 같은 관리대상의 목록을 엽니다. */
  function returnToList() {
    if (!goBackToRoute(base, (href) => router.replace(href))) router.push(base);
  }

  return (
    <article
      className={styles.article}
      aria-labelledby={'notice-detail-title'}
    >
      <ListCard>
        <div
          className={styles['reader-card']}
        >
          <header
            className={styles['reader-heading']}
          >
            <div
              className={styles['reader-title']}
            >
              {notice.important && (
                <span
                  className={styles['important-badge']}
                >
                  <ServiceIcon
                    name={'notice'}
                    size={20}
                  />
                  중요
                </span>
              )}
              <h1
                id={'notice-detail-title'}
              >
                {notice.title}
              </h1>
            </div>
          </header>
          <div
            className={styles.meta}
          >
            <span>
              <ServiceIcon
                name={'person'}
                size={18}
              />
              {notice.authorName}
            </span>
            <time
              dateTime={notice.createdAt}
            >
              <ServiceIcon
                name={'calendar'}
                size={18}
              />
              {new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23'
              }).format(new Date(notice.createdAt))}
            </time>
            <span>
              <ServiceIcon
                name={'eye'}
                size={18}
              />
              {`조회 ${notice.views.toLocaleString('ko-KR')}`}
            </span>
          </div>
          <div
            className={styles['reader-content']}
          >
            <div
              className={styles['reader-body']}
            >
              <NoticeEditor
                propertyId={propertyId}
                initialContent={notice.content}
                readOnly
              />
            </div>
            <NoticeAttachments
              propertyId={propertyId}
              content={notice.content}
            />
          </div>
          {notice.canEdit && (
            <div
              className={styles['reader-actions']}
              role={'group'}
              aria-label={'공지 관리'}
            >
              <Button
                variant={'outline'}
                tone={'success'}
                disabled={busy}
                leadingIcon={(
                  <ServiceIcon
                    name={'pen'}
                  />
                )}
                onClick={() => router.push(`${base}/${notice.id}/edit`)}
              >
                수정
              </Button>
              <Button
                variant={'outline'}
                tone={'danger'}
                disabled={busy}
                leadingIcon={(
                  <ServiceIcon
                    name={'trash'}
                  />
                )}
                onClick={() => setConfirming(true)}
              >
                삭제
              </Button>
            </div>
          )}
        </div>
      </ListCard>
      <div
        className={styles['desktop-back']}
      >
        <Button
          variant={'outline'}
          tone={'neutral'}
          onClick={returnToList}
          leadingIcon={(
            <ServiceIcon
              name={'arrow'}
              className={styles['back-icon']}
            />
          )}
        >
          목록
        </Button>
      </div>
      {confirming && (
        <ClientModal
          className={styles.confirm}
          aria-labelledby={'notice-delete-title'}
          busy={busy}
          onClose={() => setConfirming(false)}
        >
          <div
            className={styles['modal-heading']}
          >
            <h2
              id={'notice-delete-title'}
            >
              공지를 삭제할까요?
            </h2>
            <Button
              variant={'ghost'}
              size={'sm'}
              iconOnly
              disabled={busy}
              aria-label={'닫기'}
              onClick={() => setConfirming(false)}
            >
              <ServiceIcon
                name={'close'}
              />
            </Button>
          </div>
          <p>
            삭제한 공지는 목록에서 표시되지 않습니다.
          </p>
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              tone={'neutral'}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              취소
            </Button>
            <Button
              variant={'outline'}
              tone={'danger'}
              loading={busy}
              onClick={() => void remove()}
            >
              삭제
            </Button>
          </div>
        </ClientModal>
      )}
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </article>
  );
}
