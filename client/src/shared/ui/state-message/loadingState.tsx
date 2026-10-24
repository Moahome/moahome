'use client';

import {
  useEffect,
  useState
} from 'react';
import { StateMessage } from './stateMessage';
import styles from './loadingState.module.css';

/** 짧은 대기는 작게 표시하고 700ms 이상 걸릴 때만 캐릭터를 보여 깜박임을 줄입니다. */
export function LoadingState({ title = '정보를 불러오고 있어요.', description = '잠시만 기다려 주세요.', layout = 'inline' }: {
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

  if (!illustrated) return (
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
  );

  return (
    <StateMessage
      variant={'loading'}
      title={title}
      layout={layout}
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
  );
}
