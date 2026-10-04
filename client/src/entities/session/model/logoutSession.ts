"use client";

import { ApiError, customAPI } from "@/shared/api";
import { SESSION_LOCK_NAME } from "./restoreSession";
import { clearSession } from "./sessionStore";

/** 진행 중인 쿠키 교체가 끝난 뒤 현재 세션을 종료하며, 일시 장애에는 로그인 상태를 유지합니다. */
export async function logoutSession(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("로그아웃은 브라우저에서만 실행할 수 있습니다.");
  }

  if (!navigator.locks) {
    throw new ApiError(0, "BROWSER_UNSUPPORTED", "브라우저를 업데이트한 뒤 다시 시도해 주세요.");
  }

  await navigator.locks.request(SESSION_LOCK_NAME, async () => {
    try {
      // 다른 탭에서 토큰이 교체되었을 수 있어 잠금 안에서 현재 쿠키의 CSRF 정보를 조회합니다.
      const csrf = await customAPI<{ csrfToken: string }>({ url: "/api/auth/web/csrf" });

      if (!csrf || typeof csrf.csrfToken !== "string" || !csrf.csrfToken.trim()) {
        throw new ApiError(200, "INVALID_RESPONSE", "로그아웃 보안 정보를 확인할 수 없습니다.");
      }

      await customAPI<void>({
        url: "/api/auth/web/logout",
        method: "POST",
        headers: { "X-CSRF-TOKEN": csrf.csrfToken },
      });
    } catch (error) {
      // 이미 만료되거나 종료된 세션은 로그아웃된 상태입니다. 권한 거부와 서버 장애는 그대로 알립니다.
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error;
      }
    }

    clearSession();
  });
}
