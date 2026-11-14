'use client';

import {
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Input } from '@/shared/ui/form-controls';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { LoadingState } from '@/shared/ui/state-message';
import { Toast } from '@/shared/ui/toast';
import {
  createNoticeAccessLink,
  getNoticeAccessLink,
  revokeNoticeAccessLink
} from '../../../api/residentNoticeManagementApi';
import styles from './noticeAccessLink.module.css';

/** 주민 공개 공지 전체를 읽는 건물 링크를 발급·복사·회수하며 메시지를 자동 발송하지 않습니다. */
export function NoticeAccessLink({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const requestId = useRef<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const key = ['notice-access-link', session.data?.id, propertyId];
  const link = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getNoticeAccessLink(propertyId, signal),
    enabled: open && Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const url = link.data?.token && typeof window !== 'undefined' ? `${window.location.origin}/notices#token=${link.data.token}` : '';

  /** 같은 발급 ID는 성공을 확인할 때까지 유지하고 회수한 ID로 새 링크를 되살리지 않습니다. */
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await createNoticeAccessLink(propertyId, requestId.current);
      cache.setQueryData(key, result);
      setToast({
        message: '주민 열람 링크를 발급했어요.'
      });
    } catch { setToast({
      message: '링크 발급 결과를 확인하지 못했어요. 다시 발급을 누르면 같은 요청을 확인해요.',
      error: true
    }); }
    finally { lock.current = false; setBusy(false); }
  }

  async function revoke() {
    if (!link.data || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await revokeNoticeAccessLink(propertyId, link.data.id);
      cache.setQueryData(key, null);
      requestId.current = null;
      setConfirm(false);
      setToast({
        message: '주민 열람 링크를 회수했어요.'
      });
    } catch { setToast({
      message: '회수 결과를 확인하지 못했어요. 다시 시도해주세요.',
      error: true
    }); }
    finally { lock.current = false; setBusy(false); }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setToast({
        message: '주민 열람 링크를 복사했어요.'
      });
    } catch { setToast({
      message: '링크를 선택해서 직접 복사해주세요.',
      error: true
    }); }
  }

  return (
    <>
      <Button
        variant={'outline'}
        leadingIcon={(
          <ServiceIcon
            name={'link'}
          />
        )}
        onClick={() => setOpen(true)}
      >
        주민 열람 링크
      </Button>
      {open && (
        <ClientModal
          className={styles.modal}
          aria-labelledby={'notice-access-link-title'}
          busy={busy}
          onClose={() => { setOpen(false); setConfirm(false); }}
        >
          <header>
            <h2
              id={'notice-access-link-title'}
            >
              주민 열람 링크
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'닫기'}
              disabled={busy}
              onClick={() => { setOpen(false); setConfirm(false); }}
            >
              <ServiceIcon
                name={'close'}
              />
            </Button>
          </header>
          <p>
            이 건물의 모든 공지 목록과 상세를 볼 수 있는 링크입니다. 회수할 때까지 재사용할 수 있어요.
          </p>
          <p
            className={styles.note}
          >
            링크를 전달받은 사람도 열람할 수 있으니 주민에게만 전달해주세요.
          </p>
          {link.isPending ? (
            <LoadingState />
          ) : link.isError ? (
            <RequestError
              error={link.error}
              onRetry={() => void link.refetch()}
            />
          ) : link.data ? (
            <>
              {url ? (
                <Input
                  aria-label={'주민 열람 주소'}
                  readOnly
                  value={url}
                  onFocus={(event) => event.target.select()}
                />
              ) : (
                <p
                  role={'alert'}
                >
                  기존 링크를 다시 복사할 수 없어요. 회수 후 새로 발급해주세요.
                </p>
              )}
              {confirm && (
                <p
                  role={'alert'}
                >
                  회수하면 기존 링크와 열람 중인 화면의 다음 요청이 차단됩니다.
                </p>
              )}
              <div
                className={styles.actions}
              >
                {confirm ? (
                  <>
                    <Button
                      variant={'outline'}
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      취소
                    </Button>
                    <Button
                      variant={'outline'}
                      tone={'danger'}
                      loading={busy}
                      onClick={() => void revoke()}
                    >
                      회수
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant={'outline'}
                      tone={'danger'}
                      disabled={busy}
                      onClick={() => setConfirm(true)}
                    >
                      링크 회수
                    </Button>
                    <Button
                      disabled={!url || busy}
                      onClick={() => void copy()}
                    >
                      복사
                    </Button>
                  </>
                )}
              </div>
            </>

          ) : (
            <div
              className={styles.actions}
            >
              <Button
                loading={busy}
                onClick={() => void create()}
              >
                링크 발급
              </Button>
            </div>
          )}
        </ClientModal>
      )}
      {toast && (
        <Toast
          message={toast.message}
          tone={toast.error ? 'error' : 'success'}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
