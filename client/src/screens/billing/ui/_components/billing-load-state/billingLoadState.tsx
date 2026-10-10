import { Button } from '@/shared/ui/button';
import { getBillingError } from '@/features/billing-management';
import styles from './billingLoadState.module.css';

/** 로딩·권한·저장소 오류를 실제 빈 목록과 구분해 재시도할 수 있게 합니다. */
export function BillingLoadState({ pending, error, onRetry }: { pending: boolean; error: unknown; onRetry: () => void }) {
  return (
    <section
      className={styles.state}
      role={pending ? 'status' : 'alert'}
    >
      <strong>
        {pending ? '관리비 정보를 불러오고 있어요.' : getBillingError(error)}
      </strong>
      {!pending && (
        <Button
          variant={'outline'}
          onClick={onRetry}
        >
          다시 시도
        </Button>
      )}
    </section>
  );
}
