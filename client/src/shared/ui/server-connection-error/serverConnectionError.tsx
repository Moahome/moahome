'use client';

import Image from 'next/image';
import { useId } from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './serverConnectionError.module.css';

/** 실패한 조회의 재시도만 호출하며, 입력 보존 안내는 폼을 실제로 유지하는 호출부에서만 켭니다. */
export function ServerConnectionError({
  onRetry,
  retrying = false,
  inputPreserved = false,
  title = '서버에 연결하지 못했어요',
  description,
}: {
  onRetry?: () => void;
  retrying?: boolean;
  inputPreserved?: boolean;
  title?: string;
  description?: string;
}) {
  const titleId = useId();

  return (
    <section
      className={styles.card}
      role={'alert'}
      aria-labelledby={titleId}
      aria-busy={retrying}
    >
      <Image
        className={styles.illustration}
        src={'/images/errors/serverError.webp'}
        alt={''}
        width={1536}
        height={1024}
        sizes={'(max-width: 600px) 80vw, 420px'}
        loading={'eager'}
      />
      <h2
        id={titleId}
      >
        {title}
      </h2>
      <div
        className={styles.description}
      >
        <p>
          {description ?? '일시적인 오류로 서버와 연결할 수 없습니다.'}
        </p>
        {!description && (
          <p>
            {inputPreserved && (
              <>
                입력하신 내용은 그대로 유지되어 있으니
                <br />
              </>
            )}
            잠시 후 다시 시도해 주세요.
          </p>
        )}
      </div>
      {onRetry && (
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
    </section>
  );
}
