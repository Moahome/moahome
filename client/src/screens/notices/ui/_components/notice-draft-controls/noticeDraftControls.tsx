'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  DRAFT_REMOVED_EVENT,
  clearNoticeDrafts,
  hasNoticeDraftContent,
  getNoticeDraftSignature,
  readNoticeDraft,
  saveNoticeDraft,
  type NoticeDraft
} from '../../../model/noticeDraft';
import styles from './noticeDraftControls.module.css';

/** 이전 초안은 명시적으로 불러오며 작성 중 변경은 나가기 전에 같은 계정·관리대상에 자동 저장합니다. */
export function NoticeDraftControls({ value, disabled, onRestore, children, getSubmission, baseline }: {
  value: NoticeDraft;
  baseline: Pick<NoticeDraft, 'title' | 'content' | 'important'>;
  getSubmission?: () => NoticeDraft['submission'];
  disabled: boolean;
  onRestore: (draft: NoticeDraft) => void;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [drafts, setDrafts] = useState<NoticeDraft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const manualLock = useRef(false);
  const autoSaveTask = useRef<Promise<void> | null>(null);
  const deletedSignature = useRef<string | null>(null);
  const autoWritten = useRef(false);
  const baselineValue = useRef(baseline);
  const complete = useRef(false);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = useRef(true);
  const restoreOnEntry = useEffectEvent((draft: NoticeDraft) => onRestore(draft));
  const currentSubmission = useEffectEvent(() => getSubmission?.() ?? null);

  useEffect(() => { latest.current = value; }, [value]);

  useEffect(() => {
    let active = true;
    readNoticeDraft(value.key).then(async (draft) => {
      if (!active) return;
      if (draft) {
        const changed = getNoticeDraftSignature(draft) !== getNoticeDraftSignature(baselineValue.current);
        const restore = changed && window.confirm('이전에 작성하던 내용이 있습니다. 불러올까요?');
        // 확인과 취소 모두 소비합니다. 불러온 내용 자체를 다시 자동 저장하지 않습니다.
        await clearNoticeDrafts(value.key);
        if (!active) return;
        if (restore) { restoreOnEntry(draft); baselineValue.current = draft; }
      }
      setDrafts([]);
      setReady(true);
      paused.current = false;
    }).catch(() => {
      if (!active) return;
      setFailed(true);
      setMessage('작성 내용을 임시저장할 수 없어요. 브라우저 저장 공간을 확인해주세요.');
    });
    function removed(event: Event) {
      if ((event as CustomEvent<string>).detail !== value.key) return;
      complete.current = true;
      if (timer.current) clearTimeout(timer.current);
    }
    window.addEventListener(DRAFT_REMOVED_EVENT, removed);
    return () => {
      active = false;
      window.removeEventListener(DRAFT_REMOVED_EVENT, removed);
    };
  }, [value.key]);

  useEffect(() => {
    if (!ready || disabled || complete.current) return;
    if (getNoticeDraftSignature(value) === deletedSignature.current) return;
    deletedSignature.current = null;
    const changed = getNoticeDraftSignature(value) !== getNoticeDraftSignature(baselineValue.current);
    if (!hasNoticeDraftContent(value) || !changed) {
      if (autoWritten.current) {
        autoWritten.current = false;
        void clearNoticeDrafts(value.key).then(() => setDrafts([])).catch(() => {});
      }
      return;
    }
    timer.current = setTimeout(() => {
      if (manualLock.current || paused.current) return;
      const draft = {
        ...latest.current,
        submission: currentSubmission(),
        savedAt: new Date().toISOString()
      };
      autoWritten.current = true;
      autoSaveTask.current = (autoSaveTask.current ?? Promise.resolve()).then(() => saveNoticeDraft(draft)).then(() => {
        if (!manualLock.current) setDrafts([draft]);
      }).catch(() => {
        setFailed(true);
        setMessage('자동 저장하지 못했어요. 임시저장을 다시 시도해주세요.');
      });
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ready, disabled]);

  useEffect(() => {
    /** 화면 이탈 직전의 입력도 저장하며 게시가 완료된 초안은 복구 후보로 남기지 않습니다. */
    function flush() {
      const draft = latest.current;
      if (complete.current || paused.current || manualLock.current || !hasNoticeDraftContent(draft)
        || getNoticeDraftSignature(draft) === deletedSignature.current
        || getNoticeDraftSignature(draft) === getNoticeDraftSignature(baselineValue.current)) return;
      if (timer.current) clearTimeout(timer.current);
      void saveNoticeDraft({
        ...draft,
        submission: currentSubmission(),
        savedAt: new Date().toISOString()
      }).catch(() => {});
    }
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  useEffect(() => {
    function hasChanges() { const current = latest.current, base = baselineValue.current; return hasNoticeDraftContent(current) && (getNoticeDraftSignature(current) !== getNoticeDraftSignature(base)); }
    function confirmExit(event: BeforeUnloadEvent) {
      if (complete.current || !hasChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function confirmLink(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || complete.current || !hasChanges()) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.href === window.location.href) return;
      if (!window.confirm('저장하지 않은 변경 내용이 있습니다. 나가시겠습니까?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    function confirmNavigation(event: Event) {
      if (!complete.current && hasChanges() && !window.confirm('저장하지 않은 변경 내용이 있습니다. 나가시겠습니까?')) {
        event.preventDefault();
      }
    }
    window.addEventListener('moahome:before-navigation', confirmNavigation);
    window.addEventListener('beforeunload', confirmExit);
    document.addEventListener('click', confirmLink, true);
    return () => { window.removeEventListener('moahome:before-navigation', confirmNavigation); window.removeEventListener('beforeunload', confirmExit); document.removeEventListener('click', confirmLink, true); };
  }, []);

  async function save() {
    if (manualLock.current || saving || disabled || !hasNoticeDraftContent(value)) return;
    manualLock.current = true;
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    try {
      const draft = {
        ...value,
        submission: getSubmission?.() ?? null,
        savedAt: new Date().toISOString()
      };
      await saveNoticeDraft(draft);
      deletedSignature.current = null;
      autoWritten.current = false;
      setDrafts([draft]);
      baselineValue.current = value;
      paused.current = false;
      setFailed(false);
      setMessage('임시저장했어요. 다시 들어와도 이어서 작성할 수 있어요.');
    } catch {
      setFailed(true);
      setMessage('임시저장하지 못했어요. 입력 내용은 유지됩니다.');
    } finally { manualLock.current = false; setSaving(false); }
  }

  /** 목록에서 불러온 경우에도 한 번 소비한 초안은 다시 표시하지 않습니다. */
  async function restoreSaved(draft: NoticeDraft) {
    if (manualLock.current) return;
    manualLock.current = true;
    setDraftBusy(true);
    try {
      await clearNoticeDrafts(value.key);
      autoWritten.current = false;
      deletedSignature.current = null;
      onRestore(draft);
      baselineValue.current = draft;
      setDrafts([]);
      setShowDrafts(false);
    } catch {
      setFailed(true);
      setMessage('임시저장 내용을 불러오지 못했어요. 다시 시도해주세요.');
    } finally { manualLock.current = false; setDraftBusy(false); }
  }

  /** 진행 중 자동 저장을 마친 뒤 초안만 삭제하고, 같은 입력의 자동 재생성은 실제 수정 전까지 막습니다. */
  async function deleteSaved(draft: NoticeDraft) {
    if (manualLock.current) return;
    manualLock.current = true;
    setDraftBusy(true);
    const previousSignature = deletedSignature.current;
    deletedSignature.current = getNoticeDraftSignature(latest.current);
    if (timer.current) clearTimeout(timer.current);
    try {
      // 앞선 저장이 삭제 뒤에 완료되어 초안을 되살리지 않도록 IndexedDB 작업 순서를 맞춥니다.
      await autoSaveTask.current;
      await clearNoticeDrafts(draft.key);
      autoWritten.current = false;
      setDrafts([]);
      setShowDrafts(false);
      setFailed(false);
      setMessage('임시저장한 글을 삭제했어요.');
    } catch {
      deletedSignature.current = previousSignature;
      setFailed(true);
      setMessage('임시저장한 글을 삭제하지 못했어요. 다시 시도해주세요.');
    } finally {
      manualLock.current = false;
      setDraftBusy(false);
    }
  }

  return (
    <div
      className={styles.controls}
    >
      <div
        className={styles.actions}
      >

        <Button
          variant={'outline'}
          disabled={disabled || !hasNoticeDraftContent(value)}
          loading={saving}
          onClick={() => void save()}
        >
          임시저장
        </Button>
        {drafts.length > 0 && (
          <Button
            variant={'outline'}
            disabled={disabled}
            onClick={() => setShowDrafts(true)}
          >
            임시저장 목록
          </Button>
        )}
        {children}
      </div>
      {showDrafts && (
        <ClientModal
          aria-labelledby={'notice-drafts-title'}
          onClose={() => setShowDrafts(false)}
          className={styles.modal}
          busy={draftBusy}
        >
          <header
            className={styles['modal-heading']}
          >
            <h2
              id={'notice-drafts-title'}
            >
              임시저장한 글
            </h2>
            <Button
              variant={'ghost'}
              size={'sm'}
              iconOnly
              aria-label={'닫기'}
              title={'닫기'}
              disabled={draftBusy}
              onClick={() => setShowDrafts(false)}
            >
              <ServiceIcon
                name={'close'}
                size={22}
              />
            </Button>
          </header>
          {drafts.map((draft) => (
            <div
              key={draft.key}
              className={styles['draft-row']}
            >
              <strong>
                {draft.title || '제목 없는 글'}
              </strong>
              <div
                className={styles['draft-actions']}
              >
                <Button
                  variant={'outline'}
                  disabled={draftBusy}
                  onClick={() => void restoreSaved(draft)}
                >
                  불러오기
                </Button>
                <Button
                  variant={'outline'}
                  tone={'danger'}
                  disabled={draftBusy}
                  onClick={() => void deleteSaved(draft)}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
        </ClientModal>
      )}
      {message && (
        <Toast
          message={message}
          tone={failed ? 'error' : 'success'}
          onClose={() => setMessage('')}
        />
      )}
    </div>
  );
}
