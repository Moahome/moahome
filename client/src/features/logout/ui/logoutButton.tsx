"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logoutSession } from "@/entities/session";
import styles from "./logoutButton.module.css";

/** 서버 로그아웃 성공 후 사용자 조회 캐시를 비우고 새로운 비로그인 앱 상태로 이동합니다. */
export function LogoutButton({
  variant = "button",
}: {
  variant?: "button" | "menu";
}) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: logoutSession,
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      queryClient.clear();
      // 전체 문서를 교체해 진행 중인 사용자 조회와 메모리 토큰이 다음 로그인에 남지 않게 합니다.
      window.location.replace("/login");
    },
  });

  return (
    <div
      className={styles.logout}
      data-variant={variant}
    >
      <button
        type="button"
        disabled={logout.isPending}
        aria-busy={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {logout.isPending ? "로그아웃 중…" : "로그아웃"}
      </button>
      {logout.isError && (
        <p
          role="alert"
        >
          로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
