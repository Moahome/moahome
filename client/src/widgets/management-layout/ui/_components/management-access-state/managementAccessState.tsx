import Link from 'next/link';
import { RequestError } from '@/shared/ui/server-connection-error';
import { LoadingState } from '@/shared/ui/state-message';
import { ApiError } from '@/shared/api';
import styles from './managementAccessState.module.css';

export function ManagementAccessState({
  title,
  loading = false,
  onRetry,
  error,
}: {
  title: string;
  loading?: boolean;
  onRetry?: () => void;
  error?: unknown;
}) {
  return (
    <main
      className={styles.state}
    >
      {loading ? (
        <LoadingState
          title={title}
        />
      ) : (
        <>
          {!error && (
            <p>
              {title}
            </p>
          )}
          {Boolean(error) && (
            <RequestError
              error={error}
              onRetry={onRetry}
            />
          )}
          {(!error || (error instanceof ApiError && error.status === 403)) && (
            <Link
              href={'/start'}
            >
              시작 화면으로
            </Link>
          )}
        </>
      )}
    </main>
  );
}
