'use client';

import {
  ApiError,
  customAPI
} from '@/shared/api';
import {
  clearSession,
  getSession,
  setSession
} from './sessionStore';
import type { WebSession } from './sessionStoreTypes';

// 복원과 로그아웃이 같은 쿠키를 사용하므로 모든 탭에서 같은 잠금으로 순서를 보장합니다.
export const SESSION_LOCK_NAME = 'moahome-web-session';
let pendingRestore: Promise<WebSession> | null = null;
let requiresLogin = false;

/** CSRF 조회와 Refresh Rotation을 순서대로 실행하고 검증한 Access Token을 메모리에 보관합니다. */
async function requestSession(): Promise<WebSession> {
  const csrf = await customAPI<{ csrfToken: string }>({
    url: '/api/auth/web/csrf'
  });

  if (!csrf || typeof csrf.csrfToken !== 'string' || !csrf.csrfToken.trim()) {
    throw new ApiError(200, 'INVALID_RESPONSE', '로그인 보안 정보를 확인할 수 없습니다.');
  }

  let access: { accessToken: string; tokenType: string; accessExpiresAt: string };

  try {
    access = await customAPI({
      url: '/api/auth/web/refresh',
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': csrf.csrfToken
      },
    });
  } catch (error) {
    // Rotation 응답이 유실되면 교체 여부를 알 수 없으므로 이전 쿠키로 자동 재시도하지 않습니다.
    if (error instanceof ApiError && ['NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code)) {
      requiresLogin = true;
      clearSession();
      throw new ApiError(0, 'LOGIN_REQUIRED', '로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.');
    }

    throw error;
  }

  if (
    !access ||
    typeof access.accessToken !== 'string' ||
    !access.accessToken.trim() ||
    access.tokenType !== 'Bearer' ||
    typeof access.accessExpiresAt !== 'string' ||
    !Number.isFinite(Date.parse(access.accessExpiresAt)) ||
    Date.parse(access.accessExpiresAt) <= Date.now()
  ) {
    requiresLogin = true;
    clearSession();
    throw new ApiError(200, 'LOGIN_REQUIRED', '로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.');
  }

  const session: WebSession = {
    ...access,
    tokenType: 'Bearer',
    csrfToken: csrf.csrfToken
  };
  setSession(session);
  return session;
}

/** 중복 복원을 직렬화하며, 서버가 거부한 Access Token은 로컬 만료시각과 관계없이 교체합니다. */
export function restoreSession(expiredAccessToken?: string): Promise<WebSession> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('세션 복원은 브라우저에서만 실행할 수 있습니다.'));
  }

  const currentSession = getSession();

  if (requiresLogin && !currentSession) {
    return Promise.reject(new ApiError(0, 'LOGIN_REQUIRED', '다시 로그인해 주세요.'));
  }

  // 새 로그인으로 메모리 세션이 설정된 경우 이전 실패의 재발급 차단을 해제합니다.
  requiresLogin = false;

  if (pendingRestore) {
    return pendingRestore;
  }

  // 늦게 도착한 만료 응답은 다른 요청이 이미 갱신한 토큰을 재사용하여 추가 Rotation을 막습니다.
  if (
    currentSession &&
    currentSession.accessToken !== expiredAccessToken &&
    Date.parse(currentSession.accessExpiresAt) > Date.now()
  ) {
    return Promise.resolve(currentSession);
  }

  // 탭 간 직렬화 없이 요청하면 Refresh 재사용으로 세션이 무효화될 수 있어 안전하게 중단합니다.
  if (!navigator.locks) {
    return Promise.reject(new ApiError(0, 'BROWSER_UNSUPPORTED', '브라우저를 업데이트한 뒤 다시 로그인해 주세요.'));
  }

  pendingRestore = Promise.resolve(navigator.locks.request(SESSION_LOCK_NAME, requestSession))
    .catch((error: unknown) => {
      // 저장소 장애(503)는 로그인 만료로 취급하지 않습니다. 인증 거부만 현재 메모리 세션을 지웁니다.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        requiresLogin = true;
      }

      throw error;
    })
    .finally(() => {
      pendingRestore = null;
    });

  return pendingRestore;
}
