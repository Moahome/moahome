import Link from 'next/link';
import { RequestError } from '@/shared/ui/server-connection-error';
import { LoadingState } from '@/shared/ui/state-message';
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
          <RequestError
            error={error}
            onRetry={onRetry}
          />
          <Link
            href={'/start'}
          >
            시작 화면으로
          </Link>
        </>
      )}
    </main>
  );
}
