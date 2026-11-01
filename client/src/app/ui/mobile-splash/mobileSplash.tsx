import type { ReactNode } from 'react';
import styles from './mobileSplash.module.css';

/** 기존 로고의 집·지붕·문을 조립하고 실제 페이지 준비와 독립적으로 한 번만 마무리합니다. */
export function MobileSplash({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        className={styles.splash}
        data-mobile-splash-overlay={''}
        aria-hidden={'true'}
      >
        <div
          className={styles.scene}
        >
          <svg
            className={styles.mark}
            viewBox={'20 56 216 184'}
            fill={'none'}
            aria-hidden={'true'}
          >
            <path
              className={styles['left-home']}
              d={'M28 116L79 68C84 63 92 63 97 68L132 101C136 105 138 110 138 116V214C138 224 130 232 120 232H46C36 232 28 224 28 214V116Z'}
            />
            <path
              className={styles['right-home']}
              d={'M118 116L159 76C164 71 172 71 177 76L228 124V214C228 224 220 232 210 232H136C126 232 118 224 118 214V116Z'}
            />
            <path
              className={styles.roof}
              d={'M82 113L120 75C124.5 70.5 131.5 70.5 136 75L174 113C178.5 117.5 178.5 124.5 174 129L143 160C139 164 132.5 164.4 128 160.8L82 129C76.5 124.8 76.5 117.2 82 113Z'}
            />
            <path
              className={styles['inner-home']}
              d={'M83 156L121 121C125.1 117.2 130.9 117.2 135 121L173 156V232H83V156Z'}
            />
            <g
              className={styles['door-rise']}
            >
              <path
                className={styles['door-light']}
                d={'M109 187C109 174.85 118.85 165 131 165C143.15 165 153 174.85 153 187V232H109V187Z'}
              />
              <path
                className={styles.door}
                d={'M109 187C109 174.85 118.85 165 131 165C143.15 165 153 174.85 153 187V232H109V187Z'}
              />
            </g>
          </svg>
          <p
            className={styles.name}
          >
            모아홈
          </p>
          <p
            className={styles.tagline}
          >
            우리 집 관리, 더 쉽고 편리하게
          </p>
        </div>
      </div>
      <div
        className={styles.content}
      >
        {children}
      </div>
    </>
  );
}
