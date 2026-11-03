'use client';
import Link from 'next/link';
import {
  useEffect,
  type ReactNode
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import { ApiError } from '@/shared/api';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import styles from './systemAdminShell.module.css';

/** 관리대상 소속과 독립적으로 시스템 역할을 확인하고 계정 전환 시 하위 화면을 새로 만듭니다. */
export function SystemAdminShell({ children, header, administrators = false }: { children: ReactNode; header: ReactNode; administrators?: boolean }) {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.isError && session.error instanceof ApiError && session.error.status === 401) router.replace('/login');
  }, [session.isError, session.error, router]);
  if (session.isPending) return (
    <LoadingState
      title={'계정 권한을 확인하고 있어요.'}
    />
  );
  if (session.isError) return (
    <RequestError
      error={session.error}
      onRetry={() => void session.refetch()}
    />
  );
  return (
    <div
      className={styles.shell}
    >
      {header}
      {session.data.systemRole !== 'ADMIN' ? (
        <StateMessage
          variant={'forbidden'}
          title={'시스템 관리자 권한이 필요합니다.'}
          description={'현재 계정으로 시스템 관리에 접근할 수 없습니다.'}
        />
      ) : (
        <div
          className={styles.layout}
          key={session.data.id}
        >
          <nav
            className={styles.navigation}
            aria-label={'시스템 관리 메뉴'}
          >
            <p>
              시스템 관리
            </p>
            <Link
              href={'/admin'}
              aria-current={!administrators ? 'page' : undefined}
            >
              회원 관리
            </Link>
            <Link
              href={'/admin/administrators'}
              aria-current={administrators ? 'page' : undefined}
            >
              관리자 목록
            </Link>
          </nav>
          <main
            className={styles.main}
          >
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
