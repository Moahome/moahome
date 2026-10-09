import { Button } from '@/shared/ui/button';
import styles from './registrationResultState.module.css';

/** 권한을 확인하지 못한 동안은 이전 등록 정보 없이 조회 상태와 복구 동작만 표시합니다. */
export function RegistrationResultState({
  failed,
  onRetry,
  onClose,
}: {
  failed: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <main
      className={styles.page}
      aria-busy={!failed}
      aria-labelledby={'registration-result-title'}
    >
      <div
        className={styles.card}
        role={failed ? 'alert' : 'status'}
      >
        <h1
          id={'registration-result-title'}
        >
          {failed ? '등록 결과를 확인하지 못했어요' : '등록 결과를 확인하고 있습니다'}
        </h1>
        <p>
          {failed ? '잠시 후 다시 확인해주세요.' : '잠시만 기다려주세요.'}
        </p>
        {failed && (
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              onClick={onClose}
            >
              시작 화면으로
            </Button>
            <Button
              onClick={onRetry}
            >
              다시 확인
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
