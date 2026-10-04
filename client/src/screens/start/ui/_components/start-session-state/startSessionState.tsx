"use client";

import Link from "next/link";
import { ApiError } from "@/shared/api";
import styles from "./startSessionState.module.css";

/** 복원 대기와 조회 실패를 구분하며 일시 장애에만 재시도 버튼을 제공합니다. */
export function StartSessionState({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  if (!error) {
    return (
      <main
        className={styles["session-state"]}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p>
          로그인 정보를 확인하고 있어요.
        </p>
      </main>
    );
  }

  const canRetry = error instanceof ApiError
    && (error.status === 503 || error.code === "NETWORK_ERROR");

  return (
    <main
      className={styles["session-state"]}
      role="alert"
      aria-labelledby="session-title"
    >
      <h1
        id="session-title"
      >
        로그인 정보를 확인하지 못했어요
      </h1>
      <p>
        {canRetry ? "잠시 후 다시 시도해 주세요." : "다시 로그인해 주세요."}
      </p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
        >
          다시 시도
        </button>
      )}
      <Link
        href="/login"
      >
        로그인 화면으로
      </Link>
    </main>
  );
}
