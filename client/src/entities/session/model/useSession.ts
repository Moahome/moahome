"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/shared/api";
import { getCurrentUser } from "../api/currentUserApi";
import { restoreSession } from "./restoreSession";
import { clearSession } from "./sessionStore";

/** 세션 복원 후 본인 정보를 조회하며 인증 거부만 토큰을 지우고 일시 장애는 재시도할 수 있게 둡니다. */
async function loadCurrentUser() {
  try {
    await restoreSession();
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_UNAVAILABLE")) {
      clearSession();
    }

    throw error;
  }
}

/** 앱과 화면이 같은 조회·결과를 공유합니다. 토큰 Rotation은 자동 재시도나 화면 이동으로 반복하지 않습니다. */
export function useSession() {
  return useQuery({
    queryKey: ["session", "current-user"],
    queryFn: loadCurrentUser,
    enabled: typeof window !== "undefined",
    staleTime: Infinity,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    networkMode: "always",
  });
}
