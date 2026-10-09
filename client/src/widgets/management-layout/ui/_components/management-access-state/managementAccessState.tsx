import Link from 'next/link';
import { Button } from '@/shared/ui/button';
import styles from './managementAccessState.module.css';

export function ManagementAccessState({
  title,
  loading = false,
  onRetry,
}: {
  title: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
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
