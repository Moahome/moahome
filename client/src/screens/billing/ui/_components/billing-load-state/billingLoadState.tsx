import { RequestError } from '@/shared/ui/server-connection-error';
import { LoadingState } from '@/shared/ui/state-message';
import styles from './billingLoadState.module.css';

/** 로딩·권한·저장소 오류를 실제 빈 목록과 구분해 재시도할 수 있게 합니다. */
export function BillingLoadState({ pending, error, onRetry }: { pending: boolean; error: unknown; onRetry: () => void }) {
  if (!pending) return (
    <RequestError
      error={error}
      onRetry={onRetry}
    />
  );
  return (
    <section
      className={styles.state}
    >
      <LoadingState
        title={'관리비 정보를 불러오고 있어요.'}
      />
    </section>
  );
}
