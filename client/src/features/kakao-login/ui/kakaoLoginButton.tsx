"use client";

import { useState } from "react";
import { getApiUrl } from "@/shared/api";
import styles from "./kakaoLoginButton.module.css";

export function KakaoLoginButton() {
  const [notice, setNotice] = useState("");

  /** 서버가 OAuth 상태와 카카오 토큰 교환을 관리하도록 로그인 시작 주소로 브라우저를 이동합니다. */
  function startKakaoLogin() {
    try {
      window.location.assign(getApiUrl("/oauth2/authorization/kakao").toString());
    } catch {
      setNotice("지금은 로그인을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div
      className={styles["kakao-login"]}
    >
      <button
        type="button"
        className={styles["login-button"]}
        onClick={startKakaoLogin}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M12 3C6.48 3 2 6.46 2 10.73c0 2.75 1.86 5.16 4.66 6.52l-1.18 4.32c-.1.36.3.64.6.43l5.17-3.49c.25.02.5.03.75.03 5.52 0 10-3.46 10-7.73S17.52 3 12 3Z"
          />
        </svg>
        <span>
          카카오로 시작하기
        </span>
      </button>
      <p
        className={styles.notice}
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
    </div>
  );
}
