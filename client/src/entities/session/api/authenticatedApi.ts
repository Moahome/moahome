"use client";

import { ApiError, customAPI, type CustomApiOptions } from "@/shared/api";
import { restoreSession } from "../model/restoreSession";
import { getSession } from "../model/sessionStore";

/** 메모리의 Bearer로 업무 API를 호출하고, Access 만료 응답에서만 재발급 후 원래 요청을 한 번 재시도합니다. */
export async function authenticatedAPI<T = unknown>(options: CustomApiOptions): Promise<T> {
  const session = getSession();

  // 초기 세션 복원은 호출자가 수행하며, 토큰 누락을 Access 만료로 간주해 재발급하지 않습니다.
  if (!session) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const request = { ...options, headers };

  try {
    return await customAPI<T>(request);
  } catch (error) {
    // 다른 401, 권한 거부, 장애와 네트워크 오류는 원래 실패로 전달하여 재발급을 반복하지 않습니다.
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== "ACCESS_TOKEN_EXPIRED") {
      throw error;
    }

    const refreshedSession = await restoreSession(session.accessToken);
    headers.set("Authorization", `Bearer ${refreshedSession.accessToken}`);

    // 재시도는 공통 전송 함수를 직접 호출하므로 다시 만료되어도 추가 재발급이나 재시도를 하지 않습니다.
    return customAPI<T>(request);
  }
}
