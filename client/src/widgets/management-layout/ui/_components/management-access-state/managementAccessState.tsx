import Link from 'next/link';
import { Button } from '@/shared/ui/button';
import { isServerConnectionError } from '@/shared/api';
import { ServerConnectionError } from '@/shared/ui/server-connection-error';
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
  if (!loading && onRetry && isServerConnectionError(error)) return (
    <main
      className={styles.state}
    >
      <ServerConnectionError
        onRetry={onRetry}
      />
    </main>
  );
  return (
    <main
      className={styles.state}
      role={loading ? 'status' : 'alert'}
      aria-busy={loading}
    >
      <p>
        {title}
      </p>
      {!loading && (
        <div>
          {onRetry && (
            <Button
              onClick={onRetry}
            >
              다시 시도
            </Button>
          )}
          <Link
            href={'/start'}
          >
            시작 화면으로
          </Link>
        </div>
      )}
    </main>
  );
}
