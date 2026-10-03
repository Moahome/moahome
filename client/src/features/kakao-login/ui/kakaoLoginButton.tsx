"use client";

import { useState } from "react";
import styles from "./kakaoLoginButton.module.css";

export function KakaoLoginButton() {
  const [isNoticeVisible, setIsNoticeVisible] = useState(false);

  return (
    <div className={styles["kakao-login"]}>
      <button
        type="button"
        className={styles["login-button"]}
        onClick={() => setIsNoticeVisible(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3C6.48 3 2 6.46 2 10.73c0 2.75 1.86 5.16 4.66 6.52l-1.18 4.32c-.1.36.3.64.6.43l5.17-3.49c.25.02.5.03.75.03 5.52 0 10-3.46 10-7.73S17.52 3 12 3Z" />
        </svg>
        <span>카카오로 시작하기</span>
      </button>
      <p className={styles.notice} role="status" aria-live="polite">
        {isNoticeVisible && "카카오 로그인을 준비하고 있어요. 조금만 기다려 주세요."}
      </p>
    </div>
  );
}
