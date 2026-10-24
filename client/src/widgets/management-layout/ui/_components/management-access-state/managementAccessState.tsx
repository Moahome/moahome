import Link from 'next/link';
import { RequestError } from '@/shared/ui/server-connection-error';
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
        <p
          role={'status'}
        >
          {title}
        </p>
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
