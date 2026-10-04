"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/entities/session";
import { ApiError } from "@/shared/api";
import { NeighborhoodIllustration } from "@/shared/ui/neighborhood-illustration";
import { StartHeader } from "./_components/start-header/startHeader";
import { StartIntro } from "./_components/start-intro/startIntro";
import { StartNoticeDialog } from "./_components/start-notice-dialog/startNoticeDialog";
import { StartSessionState } from "./_components/start-session-state/startSessionState";
import { PendingRequestCard } from "./_components/pending-request-card/pendingRequestCard";
import { StartCard } from "./_components/start-card/startCard";
import styles from "./startPage.module.css";

/** 세션과 본인 정보가 확인된 사용자에게만 시작 화면을 표시합니다. */
export function StartPage() {
  const session = useSession();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState({ title: "", message: "" });
  const requiresLogin = session.isError && session.error instanceof ApiError
    && (session.error.status === 401 || session.error.code === "ACCOUNT_UNAVAILABLE");

  useEffect(() => {
    // 인증 거부가 확정된 경우에만 이동해 일시적인 조회 장애를 로그아웃으로 처리하지 않습니다.
    if (!session.isFetching && requiresLogin) {
      router.replace("/login");
    }
  }, [router, session.isFetching, requiresLogin]);

  /** 아직 제공하지 않는 기능은 대기 요청이나 알림이 있다고 가정하지 않고 준비 상태를 안내합니다. */
  function showNotice(title: string, message: string) {
    setNotice({ title, message });
    dialogRef.current?.showModal();
  }

  /** 사용자 재시도는 진행 중인 토큰 교체 요청을 취소하지 않고 기존 요청을 공유합니다. */
  function retryRestore() {
    void session.refetch({ cancelRefetch: false });
  }

  if (!session.isSuccess) {
    return (
      <StartSessionState
        error={!session.isFetching && !requiresLogin ? session.error : null}
        onRetry={retryRestore}
      />
    );
  }

  return (
    <div
      className={styles.page}
    >
      <StartHeader
        user={session.data}
        onNotify={() => showNotice("알림", "알림 기능을 준비하고 있어요.")}
      />
      <main
        className={styles.main}
      >
        <StartIntro />
        <div
          className={styles["start-options"]}
        >
          <StartCard
            kind="create"
            onSelect={showNotice}
          />
          <StartCard
            kind="join"
            onSelect={showNotice}
          />
        </div>
        <PendingRequestCard
          onSelect={() => showNotice("승인 대기 중인 요청", "가입 요청 조회 기능을 준비하고 있어요.")}
        />
      </main>
      <div
        className={styles["background-left"]}
      >
        <NeighborhoodIllustration />
      </div>
      <div
        className={styles["background-right"]}
      >
        <NeighborhoodIllustration />
      </div>
      <footer
        className={styles.footer}
      >
        우리의 공간이 더 특별해지는, 모아홈
      </footer>
      <StartNoticeDialog
        dialogRef={dialogRef}
        title={notice.title}
        message={notice.message}
      />
    </div>
  );
}
