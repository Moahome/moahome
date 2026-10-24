'use client';

import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { StateMessage } from '@/shared/ui/state-message';
import { ApiError } from '@/shared/api';
import styles from './serverConnectionError.module.css';

/** 실패한 조회의 재시도만 호출하며, 입력 보존 안내는 폼을 실제로 유지하는 호출부에서만 켭니다. */
export function ServerConnectionError({
  onRetry,
  retrying = false,
  inputPreserved = false,
  title = '서버에 연결하지 못했어요',
  description,
  error,
}: {
  onRetry?: () => void;
  retrying?: boolean;
  inputPreserved?: boolean;
  title?: string;
  description?: string;
  error?: unknown;
}) {
  const networkFailure = error instanceof ApiError && error.code === 'NETWORK_ERROR';

  return (
    <StateMessage
      variant={networkFailure ? 'network-error' : 'server-error'}
      role={'alert'}
      busy={retrying}
      title={title}
      description={(
        <>
          {description ?? (networkFailure ? '인터넷 연결을 확인해 주세요.' : '일시적인 오류로 서버와 연결할 수 없습니다.')}
          {!description && (
            <>
              <br />
              {inputPreserved && (
                <>
                  입력하신 내용은 그대로 유지되어 있으니
                  <br />
                </>
              )}
              잠시 후 다시 시도해 주세요.
            </>
          )}
        </>
      )}
      actions={onRetry && (
        <Button
          className={styles.retry}
          size={'lg'}
          loading={retrying}
          onClick={onRetry}
          leadingIcon={(
            <ServiceIcon
              name={'reset'}
            />
          )}
        >
          {retrying ? '다시 연결하고 있어요' : '다시 시도'}
        </Button>
      )}
    />
  );
}
