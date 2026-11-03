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
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { LoadingState } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import { Toast } from '@/shared/ui/toast';
import {
  changeSystemMember,
  getSystemMember,
  systemAdminError
} from '../../../api/systemAdminApi';
import type { AdminCommand } from '../../../api/systemAdminApiTypes';
import styles from './memberEditor.module.css';

/** 회원의 전체 식별자와 두 권한을 구분하고 확인한 변경만 서버에 요청합니다. */
export function MemberEditor({ userId }: { userId: string }) {
  const session = useSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['system-admin-member', session.data?.id, userId],
    queryFn: ({ signal }) => getSystemMember(userId, signal),
    enabled: session.data?.systemRole === 'ADMIN',
    retry: false,
    gcTime: 0
  });
  const [command, setCommand] = useState<AdminCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /** 실패 시 요청 ID와 입력을 유지해 응답 유실·중복 클릭에도 한 번만 변경합니다. */
  async function save() {
    if (!command || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await changeSystemMember(userId, command);
      setCommand(null); setNotice('권한을 변경했습니다.');
      // 이전 계정의 캐시를 새로 생성하지 않고 존재하는 조회만 무효화합니다.
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['system-admin-users']
        }),
        cache.invalidateQueries({
          queryKey: ['system-admin-member']
        }),
        cache.invalidateQueries({
          queryKey: ['session', 'current-user']
        })
      ]);
    } catch (failure) {
      setError(systemAdminError(failure));
      if (failure instanceof ApiError && failure.code === 'ADMIN_STATE_CONFLICT') {
        setCommand(null); void query.refetch();
      }
    } finally { pending.current = false; setBusy(false); }
  }
  if (query.isPending) return (
    <LoadingState
      title={'회원 정보를 불러오고 있어요.'}
    />
  );
  if (query.isError) return (
    <RequestError
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );
  const member = query.data;
  const title = command?.kind === 'promotion' ? '시스템 관리자로 승격할까요?' : `생성 권한을 ${command?.kind === 'permission' && command.allowed ? '부여' : '회수'}할까요?`;
  return (
    <div
      className={styles.editor}
    >
      <dl
        className={styles.details}
      >
        <div>
          <dt>
            회원 이름
          </dt>
          <dd>
            {member.displayName}
          </dd>
        </div>
        <div>
          <dt>
            계정 ID
          </dt>
          <dd
            className={styles.identifier}
          >
            {member.id}
          </dd>
        </div>
        <div>
          <dt>
            계정 상태
          </dt>
          <dd>
            {member.status === 'ACTIVE' ? '정상' : '이용 제한'}
          </dd>
        </div>
        <div>
          <dt>
            시스템 역할
          </dt>
          <dd>
            {member.systemRole === 'ADMIN' ? '시스템 관리자' : '일반 회원'}
          </dd>
        </div>
        <div>
          <dt>
            관리대상 생성 권한
          </dt>
          <dd>
            {member.canCreateProperty ? '허용' : '미허용'}
          </dd>
        </div>
        <div>
          <dt>
            가입일
          </dt>
          <dd>
            {new Intl.DateTimeFormat('ko-KR', {
              timeZone: 'Asia/Seoul'
            }).format(new Date(member.createdAt))}
          </dd>
        </div>
      </dl>
      <div
        className={styles.actions}
      >
        <Button
          disabled={busy || member.status !== 'ACTIVE'}
          onClick={() => { setError(''); setCommand({
            kind: 'permission',
            requestId: crypto.randomUUID(),
            allowed: !member.canCreateProperty,
            expectedAllowed: member.canCreateProperty
          }); }}
        >
          {member.canCreateProperty ? '생성 권한 회수' : '생성 권한 부여'}
        </Button>
        {member.systemRole !== 'ADMIN' && (
          <Button
            variant={'outline'}
            disabled={busy || member.status !== 'ACTIVE'}
            onClick={() => { setError(''); setCommand({
              kind: 'promotion',
              requestId: crypto.randomUUID()
            }); }}
          >
            시스템 관리자 승격
          </Button>
        )}
      </div>
      {notice && (
        <Toast
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
      {error && !command && (
        <p
          role={'alert'}
          className={styles.error}
        >
          {error}
        </p>
      )}
      {command && (
        <ClientModal
          aria-labelledby={'system-admin-confirm-title'}
          className={styles.confirm}
          busy={busy}
          onClose={() => { if (!busy) setCommand(null); }}
        >
          <h2
            id={'system-admin-confirm-title'}
          >
            {title}
          </h2>
          <p>
            {member.displayName}
          </p>
          <p
            className={styles.identifier}
          >
            {member.id}
          </p>
          <p>
            {command.kind === 'promotion' ? '회원의 생성 권한과 시스템 관리자 지정을 관리할 수 있게 됩니다.' : '기존 관리대상의 이용 권한은 유지됩니다.'}
          </p>
          {error && (
            <p
              role={'alert'}
              className={styles.error}
            >
              {error}
            </p>
          )}
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              tone={'neutral'}
              disabled={busy}
              onClick={() => setCommand(null)}
            >
              취소
            </Button>
            <Button
              loading={busy}
              onClick={() => void save()}
            >
              확인
            </Button>
          </div>
        </ClientModal>
      )}
    </div>
  );
}
