'use client';

import {
  useEffect,
  useState
} from 'react';
import { StateMessage } from './stateMessage';
import styles from './loadingState.module.css';

/** 넓은 흰 카드 없이 중앙에 큰 원형 대기를 표시하고 700ms 이후에는 기존 캐릭터를 함께 보여줍니다. */
export function LoadingState({ title = '정보를 불러오고 있어요.', description = '잠시만 기다려 주세요.', layout = 'page' }: {
  title?: string;
  description?: string;
  layout?: 'page' | 'inline';
}) {
  const [illustrated, setIllustrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIllustrated(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const indicator = (
    <span
      className={styles.indicator}
      aria-hidden={'true'}
    />
  );

  return (
    <div
      className={styles.surface}
      data-layout={layout}
    >
      {illustrated ? (
        <StateMessage
          variant={'loading'}
          title={title}
          layout={'inline'}
          busy
          description={(
            <span
              className={styles.details}
            >
              {indicator}
              <span>
                {description}
              </span>
            </span>
          )}
        />
      ) : (
        <div
          className={styles.compact}
          role={'status'}
          aria-label={title}
          aria-busy={'true'}
        >
          {indicator}
          <span>
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
