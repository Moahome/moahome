"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { restoreSession } from "@/features/restore-session";
import { BrandMark } from "@/shared/ui/brand-mark";
import { ApiError } from "@/shared/api";
import styles from "./loginCallbackPage.module.css";

type CallbackState =
  | {
      status: "loading";
    }
  | {
      status: "success";
    }
  | {
      status: "error";
      message: string;
      canRetry: boolean;
    };

/** 일시 장애와 재로그인이 필요한 실패를 구분해 안전한 사용자 안내를 제공합니다. */
function getFailureState(error: unknown): CallbackState {
  if (!(error instanceof ApiError)) {
    return {
      status: "error",
      message: "지금은 로그인할 수 없어요. 잠시 후 다시 로그인해 주세요.",
      canRetry: false,
    };
  }

  if (error.status === 503 || error.code === "NETWORK_ERROR") {
    return {
      status: "error",
      message: "로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
      canRetry: true,
    };
  }

  if (error.code === "BROWSER_UNSUPPORTED") {
    return {
      status: "error",
      message: "브라우저를 업데이트한 뒤 다시 로그인해 주세요.",
      canRetry: false,
    };
  }

  if (error.code === "ACCOUNT_UNAVAILABLE") {
    return {
      status: "error",
      message: "현재 이용할 수 없는 계정이에요.",
      canRetry: false,
    };
  }

  return {
    status: "error",
    message: "로그인을 완료하지 못했어요. 다시 로그인해 주세요.",
    canRetry: false,
  };
}

export function LoginCallbackPage() {
  const [state, setState] = useState<CallbackState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    // 언마운트는 화면 갱신만 중단합니다. 진행 중인 Rotation을 취소하면 응답이 유실될 수 있습니다.
    restoreSession().then(
      () => {
        if (active) {
          setState({ status: "success" });
        }
      },
      (error: unknown) => {
        if (active) {
          setState(getFailureState(error));
        }
      },
    );

    return () => {
      active = false;
    };
  }, [attempt]);

  /** 재시도가 가능한 조회 실패나 일시 장애에 한해 세션 복원을 다시 요청합니다. */
  function retryRestore() {
    setState({ status: "loading" });
    setAttempt((currentAttempt) => currentAttempt + 1);
  }

  let title = "로그인하고 있어요";
  let description = "잠시만 기다려 주세요.";

  if (state.status === "success") {
    title = "로그인했어요";
    description = "모아홈에 오신 것을 환영해요.";
  }

  if (state.status === "error") {
    title = "로그인을 확인해 주세요";
    description = state.message;
  }

  return (
    <main className={styles.page}>
      <section
        className={styles.card}
        aria-labelledby="callback-title"
        aria-busy={state.status === "loading"}
      >
        <Link
          href="/"
          className={styles.brand}
          aria-label="모아홈 홈으로"
        >
          <BrandMark />
          <span>모아홈</span>
        </Link>
        <div
          className={styles.content}
          role={state.status === "error" ? "alert" : "status"}
          aria-labelledby="callback-title"
          aria-live="polite"
        >
          <div
            className={styles.indicator}
            data-status={state.status}
            aria-hidden="true"
          >
            {state.status === "loading" && <span className={styles.spinner} />}
            {state.status === "success" && <span>✓</span>}
            {state.status === "error" && <span>!</span>}
          </div>
          <h1 id="callback-title">{title}</h1>
          <p>{description}</p>
        </div>
        {state.status === "success" && (
          <Link href="/" className={styles.action}>
            모아홈 홈으로
          </Link>
        )}
        {state.status === "error" && (
          <div className={styles.actions}>
            {state.canRetry && (
              <button
                type="button"
                className={styles.action}
                onClick={retryRestore}
              >
                다시 시도
              </button>
            )}
            <Link href="/login" className={styles["secondary-action"]}>
              로그인 화면으로
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
