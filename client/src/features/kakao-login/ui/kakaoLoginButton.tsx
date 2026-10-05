'use client';

import { useState } from 'react';
import { getApiUrl } from '@/shared/api';
import styles from './kakaoLoginButton.module.css';

export function KakaoLoginButton() {
  const [notice, setNotice] = useState('');

  /** 서버에서 OAuth를 시작하며, 계정 변경을 선택한 경우 카카오 인증 화면을 다시 요청합니다. */
  function startKakaoLogin(forceLogin = false) {
    // 카카오톡 내부 브라우저는 prompt=login을 지원하지 않아 외부 브라우저 사용을 안내합니다.
    if (forceLogin && /KAKAOTALK/i.test(navigator.userAgent)) {
      setNotice('다른 계정으로 로그인하려면 Chrome이나 Safari에서 열어주세요.');
      return;
    }

    try {
      const url = getApiUrl('/oauth2/authorization/kakao');

      if (forceLogin) {
        url.searchParams.set('prompt', 'login');
      }

      window.location.assign(url.toString());
    } catch {
      setNotice('지금은 로그인을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  return (
    <div
      className={styles['kakao-login']}
    >
      <button
        type={'button'}
        className={styles['login-button']}
        onClick={() => startKakaoLogin()}
      >
        <svg
          viewBox={'0 0 24 24'}
          aria-hidden={'true'}
        >
          <path
            d={'M12 3C6.48 3 2 6.46 2 10.73c0 2.75 1.86 5.16 4.66 6.52l-1.18 4.32c-.1.36.3.64.6.43l5.17-3.49c.25.02.5.03.75.03 5.52 0 10-3.46 10-7.73S17.52 3 12 3Z'}
          />
        </svg>
        <span>
          카카오로 시작하기
        </span>
      </button>
      <button
        type={'button'}
        className={styles['switch-account-button']}
        onClick={() => startKakaoLogin(true)}
      >
        다른 계정으로 로그인
      </button>
      <p
        className={styles.notice}
        role={'status'}
        aria-live={'polite'}
      >
        {notice}
      </p>
    </div>
  );
}
